var path        = require('path'),
    spritesmith = require('spritesmith'),
    File        = require('vinyl'),
    _           = require('lodash'),
    colors      = require('colors'),
    fs          = require('fs'),
    gutil       = require('gulp-util'),
    async       = require('async'),
    Q           = require('q'),
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
    var httpRegex, imageRegex, filePathRegex, pngRegex, retinaRegex;

    imageRegex    = new RegExp('background-image:[\\s]?url\\(["\']?([\\w\\d\\s!:./\\-\\_@]*\\.[\\w?#]+)["\']?\\)[^;]*\\;(?: \\/\\* @sprite (\\{[^}]*\\}) \\*\\/)?', 'ig');
    retinaRegex   = new RegExp('@(\\d)x\\.[a-z]{3,4}$', 'ig');
    httpRegex     = new RegExp('http[s]?', 'ig');
    pngRegex      = new RegExp('\\.png$', 'ig');
    filePathRegex = new RegExp('["\']?([\\w\\d\\s!:./\\-\\_@]*\\.[\\w?#]+)["\']?', 'ig');

    return function(file, content, options) {
        var deferred = Q.defer(),
            reference, images, chain,
            retina;

        images = [];

        while ((reference = imageRegex.exec(content)) != null) {
            var filePath, url, image, meta, basename;

            basename = path.basename(file.path);

            image = {
                replacement: reference[0],
                url: (url = reference[1]),
                group: [],
                isRetina: false,
                retinaRatio: 1
            };

            if (httpRegex.test(url)) {
                log(colors.cyan(basename) + ' > ' + url + ' has been skipped as it\'s an external resource!');
                continue;
            }

            if (!pngRegex.test(url)) {
                log(colors.cyan(basename) + ' > ' + url + ' has been skipped as it\'s not a PNG!');
                continue;
            }

            if (meta = reference[2]) {
                try {
                    image.meta = JSON.parse(meta);
                } catch (err) {
                    log(colors.cyan(basename) + ' > ' + colors.white('Can not parse meta json for ' + url) + ': "' + colors.red(err) + '"');
                }
            }

            if (options.retina && (retina = retinaRegex.exec(url))) {
                image.isRetina = true;
                image.retinaRatio = retina[1];
            }

            filePath = filePathRegex.exec(url)[0].replace(/['"]/g, '');

            if(filePath.charAt(0) === '/') {
                filePath = path.resolve(options.baseUrl + filePath);
            } else {
                filePath = path.resolve(file.path.substring(0, file.path.lastIndexOf("/")), filePath);
            }

            image.path = filePath;

            // reset lastIndex
            [httpRegex, pngRegex, retinaRegex, filePathRegex].forEach(function(regex) {
                regex.lastIndex = 0;
            });

            images.push(image);
        }

        // reset lastIndex
        imageRegex.lastIndex = 0;

        // remove nulls
        images = _.filter(images);

        // apply user filters
        if (_.isArray(options.filter)) {
            chain = _.chain(images);

            options.filter.forEach(function(filter) {
                chain = chain.filter(filter);
            });

            images = chain.value();
        }

        // filter not existing images
        async.filter(images, function(image, ok) {
            fs.exists(image.path, function(exists) {
                !exists && log(image.path + ' has been skipped as it does not exist!');
                ok(exists);
            });
        }, deferred.resolve);

        return deferred.promise
            .then(function(images) {
                // apply user group processors
                if (_.isArray(options.groupBy)) {
                    chain = _.chain(images);

                    options.groupBy.forEach(function(groupBy) {
                        chain.map(function(image) {
                            var mapped, group;

                            mapped = _.clone(image);
                            (group = groupBy(image)) && mapped.group.push(group);

                            return mapped;
                        });
                    });

                    image = chain.value();
                }

                return images;
            });
    }
})();

var callSpriteSmithWith = (function() {
    var GROUP_DELIMITER = ".",
        GROUP_MASK = "*";

    // helper function to minimize user group names symbols collisions
    function mask(toggle) {
        var from, to;

        from = new RegExp("[" + (toggle ? GROUP_DELIMITER : GROUP_MASK) + "]", "gi");
        to = toggle ? GROUP_MASK : GROUP_DELIMITER;

        return function(value) {
            return value.replace(from, to);
        }
    }

    return function(images, options) {
        var all;

        all = _.chain(images)
            .groupBy(function(image) {
                var tmp;

                tmp = image.group.map(mask(true));
                tmp.unshift('_');

                return tmp.join(GROUP_DELIMITER);
            })
            .map(function(images, tmp) {
                var config;

                config = _.merge({}, options, {
                    src: _.pluck(images, 'path')
                });

                return Q.nfcall(spritesmith, config).then(function(result) {
                    tmp = tmp.split(GROUP_DELIMITER);
                    tmp.shift();

                    // append info about sprite group
                    result.group = tmp.map(mask(false));

                    return result;
                });
            })
            .value();


        return Q.all(all);
    }
})();

var updateReferencesIn = (function() {
    var template;

    template = _.template(
        'background-image: url("<%= spriteSheetPath %>");\n    ' +
        'background-position: -<%= coordinates.x %>px -<%= coordinates.y %>px;\n    ' +
        'background-size: <%= isRetina ? (properties.width / retinaRatio) : properties.width %>px <%= isRetina ? (properties.height / retinaRatio) : properties.height %>px!important;'
    );

    return function(content) {
        return function(results) {
            results.forEach(function(images) {
                images.forEach(function(image) {
                    content = content.replace(image.replacement, template(image));
                });
            });

            return content;
        }
    }
})();

var exportSprites = (function() {
    function makeSpriteSheetPath(spriteSheetName, group) {
        var path;

        group || (group = []);

        if (group.length == 0) {
            return spriteSheetName;
        }

        path = spriteSheetName.split('.');
        Array.prototype.splice.apply(path, [path.length - 1, 0].concat(group));

        return path.join('.');
    }

    return function(stream, options) {
        return function(results) {
            return results.map(function(result) {
                var sprite;

                result.path = makeSpriteSheetPath(options.spriteSheetName, result.group);

                sprite = new File({
                    path: result.path,
                    contents: new Buffer(result.image, 'binary')
                });

                stream.push(sprite);

                log('Spritesheet', result.path, 'has been created');


                return result;
            });
        }
    }
})();

var exportStylesheet = function(stream, options) {
    return function(content) {
        var stylesheet;

        stylesheet = new File({
            path: options.styleSheetName,
            contents: new Buffer(content)
        });

        stream.push(stylesheet);

        log('Stylesheet', options.styleSheetName, 'has been created');
    }
};

var mapSpritesProperties = function(images, options) {
    return function(results) {
        return results.map(function(result) {
            return _.map(result.coordinates, function(coordinates, path) {
                return _.merge(_.find(images, {path: path}), {
                    coordinates: coordinates,
                    spriteSheetPath: options.spriteSheetPath ? options.spriteSheetPath + "/" + result.path : result.path,
                    properties: result.properties
                });
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

        baseUrl:         './',
        retina:          true,
        styleSheetName:  null,
        spriteSheetName: null,
        spriteSheetPath: null,
        filter:          [],
        groupBy:         []
    }, options || {});

    // check necessary properties
    ['spriteSheetName'].forEach(function(property) {
        if (!options[property]) {
            throw new gutil.PluginError(PLUGIN_NAME, '`' + property + '` is required');
        }
    });

    // prepare filters
    if (_.isFunction(options.filter)) {
        options.filter = [options.filter]
    }

    // prepare groupers
    if (_.isFunction(options.groupBy)) {
        options.groupBy = [options.groupBy]
    }

    // add retina grouper if needed
    if (options.retina) {
        options.groupBy.unshift(function(image) {
            if (image.isRetina) {
                return "retina-" + image.retinaRatio + "x";
            }

            return null;
        });
    }

    // create output streams
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

            if (!options.styleSheetName) {
                options.styleSheetName = path.basename(file.path);
            }

            getImages(file, content, options)
                .then(function(images) {
                    callSpriteSmithWith(images, options)
                        .then(exportSprites(spriteSheetStream, options))
                        .then(mapSpritesProperties(images, options))
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