var fs           = require('fs');
var assert       = require('chai').assert;
var File         = require('vinyl');
var path         = require('path');
var through      = require('through2');
var sprite       = require('./../index');
var test         = path.resolve(__dirname, '.');
var fixtures     = path.resolve(test, 'fixtures');
var expectations = path.resolve(test, 'expectations');
var output       = path.resolve(test, 'output');

var WRITE_EXPECTATIONS = false;

function cleanCSS(str) {
    return str.replace(/( {2,}|\t)/gi, '');
}

function assertCSS(a, expectedFile) {
    if (WRITE_EXPECTATIONS) fs.writeFileSync(expectedFile, a, 'utf8');
    var b = fs.readFileSync(expectedFile, 'utf8');
    assert.deepEqual(cleanCSS(a), cleanCSS(b));
}

var visualSpriteID = 0;
function saveSpriteForVisualInspection(file) {
    var outputFile = output + '/sprite' + (++visualSpriteID) + '.png';
    fs.writeFileSync(outputFile, file.contents);
}

describe('gulp-sprite-generator', function() {

    it('should accumulate images and create common sprite from multiple stylesheets', function(done) {
        var config, stream, errors, stylesheet, index;

        index = ['A.css', 'B.css'];

        stylesheet = {
            fixtures: [path.resolve(fixtures, 'A.css'), path.resolve(fixtures, 'B.css')],
            expectations: [path.resolve(expectations, 'A.css'), path.resolve(expectations, 'B.css')],
        };

        errors = [];

        config = {
            src: [],
            engine: null,
            algorithm: 'top-down',
            padding: 0,
            engineOpts: {},
            exportOpts: {},

            baseUrl: fixtures,
            spriteSheetName: 'sprite.png',
            spriteSheetPath: null,
            filter: [],
            groupBy: [],
            accumulate: true
        };

        stream = sprite(config);

        stream.img.on('data', function (file) {
            try {
                saveSpriteForVisualInspection(file);
                assert.equal(file.path, config.spriteSheetName);
            } catch (err) {
                errors.push(err);
            }
        });

        stream.css.on('data', function (file) {
            var id;

            id = index.indexOf(file.path);

            try {
                assertCSS(file.contents.toString(), stylesheet.expectations[id]);
            } catch (err) {
                errors.push(err);
            }
        });

        stream.write(new File({
            base: test,
            path: stylesheet.fixtures[0],
            contents: new Buffer(fs.readFileSync(stylesheet.fixtures[0]))
        }));

        stream.write(new File({
            base: test,
            path: stylesheet.fixtures[1],
            contents: new Buffer(fs.readFileSync(stylesheet.fixtures[1]))
        }));

        stream.on('finish', function() {
            done(errors[0]);
        });

        stream.end();
    });

    it('Should create sprite and change refs in stylesheet', function(done) {
        var config, stream, errors, stylesheet;

        stylesheet = {
            fixture: path.resolve(fixtures, 'stylesheet.css'),
            expectation: path.resolve(expectations, 'stylesheet.css')
        };

        errors = [];

        config = {
            src: [],
            engine:     null,
            algorithm:    'top-down',
            padding:    0,
            engineOpts: {},
            exportOpts: {},

            baseUrl: fixtures,
            spriteSheetName:    'sprite.png',
            styleSheetName: 'stylesheet.sprite.css',
            spriteSheetPath: null,
            filter: [],
            groupBy: []
        };

        stream = sprite(config);

        stream.img.on('data', function (file) {
            try {
                saveSpriteForVisualInspection(file);
                assert.equal(file.path, config.spriteSheetName);
            } catch (err) {
                errors.push(err);
            }
        });

        stream.css.on('data', function (file) {
            try {
                assertCSS(file.contents.toString(), stylesheet.expectation);
                assert.equal(file.path, config.styleSheetName);
            } catch (err) {
                errors.push(err);
            }
        });

        stream.write(new File({
            base: test,
            path: stylesheet.fixture,
            contents: new Buffer(fs.readFileSync(stylesheet.fixture))
        }));

        stream.on('finish', function() {
            done(errors[0]);
        });

        stream.end();
    });

    it('Should create sprite for retina and change refs in stylesheet', function(done) {
        var config, stream, errors, stylesheet;

        stylesheet = {
            fixture: path.resolve(fixtures, 'stylesheet.retina.css'),
            expectation: path.resolve(expectations, 'stylesheet.retina.css')
        };

        errors = [];
        config = {
            src: [],
            engine: null,
            algorithm: 'top-down',
            padding: 0,
            engineOpts: {},
            exportOpts: {},

            baseUrl: fixtures,
            spriteSheetName: 'sprite.png',
            styleSheetName:    'stylesheet.sprite.css',
            spriteSheetPath: null,
            filter: [],
            groupBy: []
        };

        stream = sprite(config);

        stream.img.on('data', function (file) {
            try {
                saveSpriteForVisualInspection(file);
                assert.equal(file.path, 'sprite.@2x.png');
            } catch (err) {
                errors.push(err);
            }
        });

        stream.css.on('data', function (file) {
            try {
                assertCSS(file.contents.toString(), stylesheet.expectation);
                assert.equal(file.path, config.styleSheetName);
            } catch (err) {
                errors.push(err);
            }
        });

        stream.write(new File({
            base: test,
            path: stylesheet.fixture,
            contents: new Buffer(fs.readFileSync(stylesheet.fixture))
        }));

        stream.on('finish', function() {
            done(errors[0]);
        });

        stream.end();
    });

    it('Should create sprite using groupBy and change refs in stylesheet', function(done) {
        var config, stream, errors, stylesheet;

        stylesheet = {
            fixture: path.resolve(fixtures, 'stylesheet.css'),
            expectation: path.resolve(expectations, 'stylesheet.groupby.css')
        };

        errors = [];

        config = {
            src: [],
            engine: null,
            algorithm: 'top-down',
            padding: 0,
            engineOpts: {},
            exportOpts: {},

            baseUrl: fixtures,
            spriteSheetName: 'sprite.png',
            styleSheetName:    'stylesheet.sprite.css',
            spriteSheetPath: null,
            filter: [],
            groupBy: []
        };

        config.groupBy.push(function(image) {
            return 'my';
        });

        stream = sprite(config);

        stream.img.on('data', function (file) {
            try {
                saveSpriteForVisualInspection(file);
                assert.equal(file.path, 'sprite.my.png');
            } catch (err) {
                errors.push(err);
            }
        });

        stream.css.on('data', function (file) {
            try {
                assertCSS(file.contents.toString(), stylesheet.expectation);
                assert.equal(file.path, config.styleSheetName);
            } catch (err) {
                errors.push(err);
            }
        });

        stream.write(new File({
            base: test,
            path: stylesheet.fixture,
            contents: new Buffer(fs.readFileSync(stylesheet.fixture))
        }));

        stream.on('finish', function() {
            done(errors[0]);
        });

        stream.end();
    });

    it('Should create sprite using filter and change refs in stylesheet', function(done) {
        var config, stream, errors, stylesheet;

        stylesheet = {
            fixture: path.resolve(fixtures, 'stylesheet.css'),
            expectation: path.resolve(expectations, 'stylesheet.filter.css')
        };

        errors = [];

        config = {
            src: [],
            engine: null,
            algorithm: 'top-down',
            padding:    0,
            engineOpts: {},
            exportOpts: {},
            baseUrl: fixtures,
            spriteSheetName: 'sprite.png',
            styleSheetName:    'stylesheet.sprite.css',
            spriteSheetPath: null,
            filter: [],
            groupBy: []
        };

        config.filter.push(function(image) {
            return image.url != '/a.png';
        });

        stream = sprite(config);

        stream.img.on('data', function (file) {
            try {
                saveSpriteForVisualInspection(file);
                assert.equal(file.path, 'sprite.png');
            } catch (err) {
                errors.push(err);
            }
        });

        stream.css.on('data', function (file) {
            try {
                assertCSS(file.contents.toString(), stylesheet.expectation);
                assert.equal(file.path, config.styleSheetName);
            } catch (err) {
                errors.push(err);
            }
        });

        stream.write(new File({
            base: test,
            path: stylesheet.fixture,
            contents: new Buffer(fs.readFileSync(stylesheet.fixture))
        }));

        stream.on('finish', function() {
            done(errors[0]);
        });

        stream.end();
    });

    it('Should create sprite reading meta in doc block and change refs in stylesheet', function(done) {
        var config, stream, errors, meta;

        errors = [];

        config = {
            baseUrl: fixtures,
            spriteSheetName: 'sprite.png',
            filter: []
        };

        meta = {
            sprite: {
                some: true,
                prop: 1,
                yes: 'no'
            }
        };

        config.filter.push(function(image) {
            try {
                assert.deepEqual(image.meta, meta.sprite);
            } catch (err) {
                errors.push(err);
            }
        });

        stream = sprite(config);

        stream.write(new File({
            base: test,
            path: path.resolve(fixtures, 'stylesheetdddd.css'),
            contents: new Buffer('.a { background-image: url("sprite.retina-2x.png"); /* @meta ' + JSON.stringify(meta) + ' */ }')
        }));

        stream.on('finish', function() {
            done(errors[0]);
        });

        stream.end();
    });

    it('Should pipe properly', function(done) {
        var config, stream, errors, stylesheet, piped;

        piped = {
            img: 0,
            css: 0,
            main: 0
        };

        stylesheet = {
            fixture: path.resolve(fixtures, 'stylesheet.css'),
            expectation: path.resolve(expectations, 'stylesheet.css')
        };

        errors = [];

        config = {
            baseUrl: fixtures,
            spriteSheetName: 'sprite.png',
            styleSheetName: 'stylesheet.sprite.css',
            spriteSheetPath: null,
            filter: [],
            groupBy: []
        };

        stream = sprite(config);

        stream.img.on('data', function (file) {
            try {
                saveSpriteForVisualInspection(file);
                assert.equal(file.path, config.spriteSheetName);
            } catch (err) {
                errors.push(err);
            }
        });

        stream.css.on('data', function (file) {
            try {
                assertCSS(file.contents.toString(), stylesheet.expectation);
                assert.equal(file.path, config.styleSheetName);
            } catch (err) {
                errors.push(err);
            }
        });

        stream.write(new File({
            base: test,
            path: stylesheet.fixture,
            contents: new Buffer(fs.readFileSync(stylesheet.fixture))
        }));


        stream.pipe(through.obj(function(file, enc, done) {
            piped.main++;
            try {
                assert.instanceOf(file, File, 'Piped in a main stream obj is not a File');
            } catch (err) {
                errors.push(err);
            }
        }));

        stream.css.pipe(through.obj(function(file, enc, done) {
            piped.css++;
            try {
                assert.instanceOf(file, File, 'Piped in a css stream obj is not a File');
            } catch (err) {
                errors.push(err);
            }
        }));

        stream.img.pipe(through.obj(function(file, enc, done) {
            piped.img++;
            try {
                assert.instanceOf(file, File, 'Piped in a img stream obj is not a File');
            } catch (err) {
                errors.push(err);
            }
        }));

        stream.on('error', function(e) {
            console.error('Encountered stream error:');
            console.error(e.stack);
            errors.push(err);
        });
        stream.on('finish', function() {
            try {
                assert.equal(1, piped.img, 'No piped data in img stream');
                assert.equal(1, piped.css, 'No piped data in css stream');
                assert.equal(1, piped.main, 'No piped data in main stream');
            } catch (err) {
                errors.push(err);
            }

            done(errors[0]);
        });

        stream.end();
    });
});
