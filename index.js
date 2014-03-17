var path        = require('path'),
    spritesmith = require('spritesmith'),
    File        = require('vinyl'),
    _           = require('lodash'),
    colors      = require('colors'),
    fs          = require('fs'),
    gutil       = require('gulp-util'),
    async       = require('async'),
    Q           = require('q'),
    Readable    = require('stream').Readable
    through     = require('through2'),

    PLUGIN_NAME = "gulp-sprite-generator";

var log = function() {
    var args, sig;

    args = Array.prototype.slice.call(arguments);
    sig = '[' + colors.green(PLUGIN_NAME) + ']';
    args.unshift(sig);

    gutil.log.apply(gutil, args);
};

var getImages = (function() {
    var httpRegex, imageRegex, filePathRegex, pngRegex;

    imageRegex    = new RegExp('background-image:[\\s]?url\\(["\']?([\\w\\d\\s!:./\\-\\_]*\\.[\\w?#]+)["\']?\\)[^;]*\;', 'ig');
    httpRegex     = new RegExp('http[s]?', 'ig');
    pngRegex      = new RegExp('\\.png$', 'ig');
    filePathRegex = new RegExp('["\']?([\\w\\d\\s!:./\\-\\_]*\\.[\\w?#]+)["\']?', 'ig');

    return function(file, content, options) {
        var deferred = Q.defer(),
            reference, images;

        images = [];

        while ((reference = imageRegex.exec(content)) != null) {
            var filePath, url, image;

            image = {
                replacement: reference[0],
                url: (url = reference[1])
            };

            if (httpRegex.test(url)) {
                log(file + ' has been skipped as it\'s an external resource!');
                continue;
            }

            if (!pngRegex.test(url)) {
                log(file + ' has been skipped as it\'s not a PNG!');
                continue;
            }

            filePath = filePathRegex.exec(url)[0].replace(/['"]/g, '');

            if(filePath.charAt(0) === '/') {
                filePath = path.resolve(options.baseUrl + filePath);
            } else {
                filePath = path.resolve(file.path.substring(0, file.path.lastIndexOf("/")), filePath);
            }

            image.filePath = filePath;

            // reset lastIndex
            httpRegex.lastIndex = pngRegex.lastIndex = filePathRegex.lastIndex = 0;

            images.push(image);
        }

        // reset lastIndex
        imageRegex.lastIndex = 0;

        async.filter(_.filter(images), function(image, ok) {
            fs.exists(image.filePath, function(exists) {
                !exists && log(image.filePath + ' has been skipped as it does not exist!');
                ok(exists);
            });
        }, deferred.resolve);


        return deferred.promise;
    }
})();

var callSpriteSmithWith = function(images, options) {
    var config;

    config = _.merge({}, options, {
        src: _.pluck(images, 'filePath')
    });

    return Q.nfcall(spritesmith, config);
};

var updateReferencesIn = function(content) {
    return function(coordinates) {
        coordinates.forEach(function(image) {
            content = content.replace(image.replacement, 'background-image: url(\''+ image.spritePath +'\');\n    background-position: -'+ image.coordinates.x +'px -'+ image.coordinates.y +'px;');
        });

        return content;
    }
};

var exportSprite = function(stream, options) {
    return function(result) {
        var sprite;

        sprite = new File({
            path: options.spriteSheetPath,
            contents: new Buffer(result.image)
        });

        stream.push(sprite);

        log('Spritesheet', options.spriteSheetPath, 'has been created');

        return result;
    }
};

var exportStylesheet = function(stream, options) {
    return function(content) {
        var stylesheet;

        stylesheet = new File({
            path: options.styleSheetPath,
            contents: new Buffer(content)
        });

        stream.push(stylesheet);

        log('Stylesheet', options.styleSheetPath, 'has been created');
    }
};

var mapSpriteProperties = function(images, options) {
    return function(result) {
        return _.map(result.coordinates, function(coordinates, filePath) {
            return _.merge(_.find(images, {filePath: filePath}), {
                coordinates: coordinates,
                spritePath: options.spriteSheetPath
            });
        });
    }
};

module.exports = function(options) { 'use strict';
    var stream, styleSheetStream, spriteSheetStream;

    options = _.merge({
        src:        [],
        engine:     "auto",
        algorithm:  "top-down",
        padding:    0,
        engineOpts: {},
        exportOpts: {},

        baseUrl:    './',
        styleSheetPath:  null,

        spriteSheetPath: null
    }, options || {});

    // check necessary properties
    ['spriteSheetPath'].forEach(function(property) {
        if (!options[property]) {
            throw new gutil.PluginError(PLUGIN_NAME, '`' + property + '` is required');
        }
    });

    styleSheetStream = through.obj();
    spriteSheetStream = through.obj();

    stream = through.obj(function(file, enc, done) {
        var content;

        if (file.isNull()) {
            this.push(file); // Do nothing if no contents
            return done();
        }

        if (file.isStream()) {
            this.emit('error', new gutil.PluginError(PLUGIN_NAME, 'Streams is not supported!'));
            return done();
        }

        if (file.isBuffer()) {
            content = file.contents.toString();

            if (!options.styleSheetPath) {
                options.styleSheetPath = path.basename(file.path);
            }

            getImages(file, content, options)
                .then(function(images) {
                    callSpriteSmithWith(images, options)
                        .then(exportSprite(spriteSheetStream, options))
                        .then(mapSpriteProperties(images, options))
                        .then(updateReferencesIn(content))
                        .then(exportStylesheet(styleSheetStream, options))
                        .then(function() {
                            done();
                        })
                        .catch(function(err) {
                            stream.emit('error', new gutil.PluginError(PLUGIN_NAME, err));
                            done();
                        });
                });


            return null;
        } else {
            this.emit('error', new gutil.PluginError(PLUGIN_NAME, 'Something went wrong!'));
            return callback();
        }
    });

    stream.css = styleSheetStream;
    stream.img = spriteSheetStream;

    return stream;
};