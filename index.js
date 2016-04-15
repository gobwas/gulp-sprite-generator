var _           = require('lodash');
var fs          = require('fs');
var path        = require('path');
var util        = require("util");
var gutil       = require('gulp-util');
var async       = require('async');
var File        = require('vinyl');
var Spritesmith = require('spritesmith');
var colors      = require('colors');
var through2    = require('through2');
var Promise     = require('es6-promise').Promise;
var Readable    = require('stream').Readable;

var PLUGIN_NAME = 'gulp-sprite-generator';
var debug;

function log() {
    var args = Array.prototype.slice.call(arguments);
    var sig = '[' + colors.green(PLUGIN_NAME) + ']';
    args.unshift(sig);
    gutil.log.apply(gutil, args);
}

var getImages = (function() {
    var imageRegex     = new RegExp('background-image\s*:[\\s]?url\\(["\']?([\\w\\d\\s!:./\\-\\_@]*\\.[\\w?#]+)["\']?\\)[^;]*\\;(?:\\s*\\/\\*\\s*@meta\\s*(\\{.*\\})\\s*\\*\\/)?', 'ig');
    var retinaRegex    = new RegExp('@(\\d)x\\.[a-z]{3,4}$', 'ig');
    var httpRegex      = new RegExp('https?', 'ig');
    var imagePathRegex = new RegExp('\\.(png|jpe?g)$', 'ig');
    var filePathRegex  = new RegExp('["\']?([\\w\\d\\s! :./\\-\\_@]*\\.[\\w?#]+)["\']?', 'ig');

    return function(file, options) {
        var reference, images,
            retina, filePath,
            url, image, meta, basename,
            makeRegexp, content;

        images = [];
        content = file.contents.toString();
        basename = path.basename(file.path);

        makeRegexp = (function() {
            var matchOperatorsRe = /[|\\/{}()[\]^$+*?.]/g;
            return function(str) {
                return str.replace(matchOperatorsRe,    '\\$&');
            }
        })();

        while ((reference = imageRegex.exec(content)) != null) {
            url     = reference[1];
            meta    = reference[2];

            image = {
                replacement: new RegExp('background-image:\\s+url\\(\\s?(["\']?)\\s?' + makeRegexp(url) + '\\s?\\1\\s?\\)[^;]*\\;', 'gi'),
                url: url,
                group: [],
                isRetina:    false,
                retinaRatio: 1,
                meta: {}
            };

            if (httpRegex.test(url)) {
                options.verbose && log(colors.cyan(basename) + ' > ' + url + ' skipped as it\'s an external resource');
                continue;
            }

            if (!imagePathRegex.test(url)) {
                options.verbose && log(colors.cyan(basename) + ' > ' + url + ' skipped as it\'s not a png or jpeg');
                continue;
            }

            if (meta) {
                try {
                    meta = JSON.parse(meta);
                    meta.sprite && (image.meta = meta.sprite);
                } catch (err) {
                    log(colors.cyan(basename) + ' > ' + colors.white('Can not parse meta json for ' + url) + ': "' + colors.red(err) + '"');
                }
            }

            if (options.retina && (retina = retinaRegex.exec(url))) {
                image.isRetina = true;
                image.retinaRatio = retina[1];
            }

            filePath = filePathRegex.exec(url)[0].replace(/['"]/g, '');

            // if url to image is relative
            if(filePath.charAt(0) === "/") {
                filePath = path.resolve(options.baseUrl + filePath);
            } else {
                filePath = path.resolve(file.path.substring(0, file.path.lastIndexOf(path.sep)), filePath);
            }

            image.path = filePath;

            // reset lastIndex
            [httpRegex, imagePathRegex, retinaRegex, filePathRegex].forEach(function(regex) {
                regex.lastIndex = 0;
            });

            images.push(image);
        }

        // reset lastIndex
        imageRegex.lastIndex = 0;

        // remove nulls and duplicates
        images = _.uniq(_.filter(images), function(image) {
            return image.path;
        });

        return Promise.resolve(images)
            // apply user filters
            .then(function(images) {
                return new Promise(function(resolve, reject) {
                    async.filter(images, function(image, callback) {
                        async.reduce(options.filter, true, function(status, filter, callback) {
                            if (!status) return callback(null, false);
                            Promise.resolve(filter(image))
                                .then(function(status) { callback(null, status); })
                                .catch(callback);
                        }, callback);
                    }, function(err, filteredImages) {
                        if (err) return reject(err);
                        resolve(filteredImages);
                    });
                });
            })
            // apply user group processors
            .then(function(images) {
                return new Promise(function(resolve, reject) {
                    async.reduce(
                        options.groupBy,
                        images,
                        function(images, groupBy, next) {
                            async.map(images, function(image, done) {
                                Promise.resolve(groupBy(image))
                                    .then(function(group) {
                                        if (group) image.group.push(group);
                                        done(null, image);
                                    })
                                    .catch(done);
                            }, next);
                        },
                        function(err, images) {
                            if (err) return reject(err);
                            resolve(images);
                        }
                    );
                });
            });
    }
})();

var callSpriteSmithWith = (function() {
    var GROUP_DELIMITER = ".", GROUP_MASK = "*";

    // helper function to minimize user group names symbols collisions
    function mask(toggle) {
        var from = new RegExp("[" + (toggle ? GROUP_DELIMITER : GROUP_MASK) + "]", "gi");
        var to = toggle ? GROUP_MASK : GROUP_DELIMITER;
        return function(value) {
            return value.replace(from, to);
        }
    }

    return function(images, options) {
        var all = _.chain(images)
            .groupBy(function(image) {
                var tmp = image.group.map(mask(true));
                tmp.unshift('_');
                return tmp.join(GROUP_DELIMITER);
            })
            .map(function(images, tmp) {
                var config = _.merge({}, options, {
                    src: images.map(function(image) {
                        return image.path;
                    })
                });

                // enlarge padding, if its retina
                if (_.every(images, function(image) { return image.isRetina; })) {
                    var ratio = _.chain(images).flatten('retinaRatio').uniq().value();
                    if (ratio.length === 1) {
                        config.padding = config.padding * ratio[0];
                    }
                }

                // validate config
                try { new Spritesmith(config); }
                catch (e) { return Promise.reject(e);}

                return new Promise(function(resolve, reject) {
                    Spritesmith.run(config, function(err, result) {
                        if (err) return reject(err);
                        tmp = tmp.split(GROUP_DELIMITER);
                        tmp.shift();
                        // append info about sprite group
                        result.group = tmp.map(mask(false));
                        resolve(result);
                    });
                });
            })
            .value();

        return Promise.all(all).then(function(results) {
            debug.images += images.length;
            debug.sprites += results.length;
            return Promise.resolve(results);
        });
    }
})();

var updateReferencesIn = (function() {
    var template;

    template = _.template(
        'background-image: url("<%= spriteSheetPath %>");\n    ' +
        'background-position: -<%= isRetina ? (coordinates.x / retinaRatio) : coordinates.x %>px -<%= isRetina ? (coordinates.y / retinaRatio) : coordinates.y %>px;\n    ' +
        'background-size: <%= isRetina ? (properties.width / retinaRatio) : properties.width %>px <%= isRetina ? (properties.height / retinaRatio) : properties.height %>px!important;'
    );

    return function(file) {
        var content = file.contents.toString();

        return function(results) {
            results.forEach(function(images) {
                images.forEach(function(image) {
                    content = content.replace(image.replacement, template(image));
                });
            });

            return Promise.resolve(content);
        }
    }
})();

var exportSprites = (function() {
    function makeSpriteSheetPath(spriteSheetName, group) {
        group = group || [];
        if (group.length == 0) return spriteSheetName;
        var path = spriteSheetName.split('.');
        Array.prototype.splice.apply(path, [path.length - 1, 0].concat(group));
        return path.join('.');
    }

    return function(stream, options) {
        return function(results) {
            results = results.map(function(result) {
                result.path = makeSpriteSheetPath(options.spriteSheetName, result.group);
                var sprite = new File({
                    path: result.path,
                    contents: new Buffer(result.image, 'binary')
                });

                stream.push(sprite);
                options.verbose && log('Spritesheet "' + result.path + '" created');
                return result;
            });

            return results;
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

        options.verbose && log('Stylesheet "' + options.styleSheetName + '" created');
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

module.exports = function(options) {
    var stream, styleSheetStream, spriteSheetStream;

    debug = {
        sprites: 0,
        images:    0
    };

    options = _.merge({
        src: [],
        engine: null, // auto
        algorithm: "top-down",
        padding: 0,
        engineOpts: {},
        exportOpts: {},
        imgOpts: {
            timeout: 30000
        },
        baseUrl: './',
        retina: true,
        styleSheetName: null,
        spriteSheetName: null,
        spriteSheetPath: null,
        filter: [],
        groupBy: [],
        accumulate: false,
        verbose: false
    }, options || {});

    options.verbose = true;

    // check necessary properties
    ['spriteSheetName'].forEach(function(property) {
        if (!options[property]) {
            throw new gutil.PluginError(PLUGIN_NAME, '`' + property + '` is required');
        }
    });

    // prepare filters
    if (typeof options.filter === 'function') {
        options.filter = [options.filter]
    }

    // prepare groupers
    if (typeof options.groupBy === 'function') {
        options.groupBy = [options.groupBy]
    }

    // add meta skip filter
    options.filter.unshift(function(image) {
        image.meta.skip && options.verbose && log(image.path + ' skipped as it meta declares to skip');
        return !image.meta.skip;
    });

    // add not existing filter
    options.filter.push(function(image) {
        return new Promise(function(resolve, reject) {
            fs.exists(image.path, function(exists) {
                !exists && options.verbose && log(image.path + ' skipped as it does not exist!');
                resolve(exists);
            });
        });
    });

    // add retina grouper if needed
    if (options.retina) {
        options.groupBy.unshift(function(image) {
            if (image.isRetina) {
                return "@" + image.retinaRatio + "x";
            }

            return null;
        });
    }

    // create output streams
    styleSheetStream = through2({objectMode: true});
    spriteSheetStream = through2({objectMode: true});

    var accumulatedFiles = [];

    stream = through2({objectMode: true},
        function(file, enc, done) {
            if (file.isNull()) {
                this.push(file); // Do nothing if no contents
                return done();
            }

            if (file.isStream()) {
                this.emit('error', new gutil.PluginError(PLUGIN_NAME, 'Streams is not supported!'));
                return done();
            }

            if (file.isBuffer()) {
                // postpone evaluation, if we are accumulating
                if (options.accumulate) {
                    accumulatedFiles.push(file);
                    stream.push(file);
                    done();
                    return;
                }
                getImages(file, options).then(function(images) {
                    callSpriteSmithWith(images, options)
                        .then(exportSprites(spriteSheetStream, options))
                        .then(mapSpritesProperties(images, options))
                        .then(updateReferencesIn(file))
                        .then(exportStylesheet(styleSheetStream, _.extend({}, options, { styleSheetName: options.styleSheetName || path.basename(file.path) })))
                        .then(function() {
                            // pipe source file
                            stream.push(file);
                            done();
                        })
                        .catch(function(err) {
                            stream.emit('error', new gutil.PluginError(PLUGIN_NAME, err));
                            done();
                        });
                }).catch(function(err) {
                    stream.emit('error', new gutil.PluginError(PLUGIN_NAME, err));
                    done();
                });

                return null;
            } else {
                this.emit('error', new gutil.PluginError(PLUGIN_NAME, 'Something went wrong!'));
                return done();
            }
        },
        // flush
        function(done) {
            var pending;

            if (options.accumulate) {
                pending = Promise
                    .all(accumulatedFiles.map(function(file) {
                        return getImages(file, options);
                    }))
                    .then(function(list) {
                        var images;

                        return _.chain(list)
                            .reduce(function(images, portion) {
                                return images.concat(portion);
                            }, [])
                            .uniq(function(image) {
                                return image.path;
                            })
                            .value();
                    })
                    .then(function(images) {
                        return callSpriteSmithWith(images, options)
                            .then(exportSprites(spriteSheetStream, options))
                            .then(mapSpritesProperties(images, options))
                            .then(function(results) {
                                return Promise.all(accumulatedFiles.map(function(file) {
                                    return updateReferencesIn(file)(results)
                                        .then(exportStylesheet(styleSheetStream, _.extend({}, options, { styleSheetName: path.basename(file.path) })));
                                }));
                            });
                    })
                    .catch(function(err) {
                        stream.emit('error', new gutil.PluginError(PLUGIN_NAME, err));
                        done();
                    });
            } else {
                pending = Promise.resolve();
            }

            pending.then(function() {
                // end streams
                styleSheetStream.push(null);
                spriteSheetStream.push(null);
                log(util.format("Created %d sprite(s) from %d images, saved %s% requests", debug.sprites, debug.images, debug.images > 0 ? ((debug.sprites / debug.images) * 100).toFixed(1) : 0));
                done();
            });
        }
    );

    stream.css = styleSheetStream;
    stream.img = spriteSheetStream;

    return stream;
};
