var fs     = require('fs'),
    assert = require('chai').assert,
    File   = require('vinyl'),
    path   = require('path'),
    sprite = require('./../index');

describe('gulp-sprite-generator', function(){

    var test, fixtures, expectations;

    before(function() {
        test       = path.resolve(__dirname, '.');
        fixtures   = path.resolve(test, 'fixtures');
        expectations   = path.resolve(test, 'expectations');
    });

    it("Should create sprite and change refs in stylesheet", function(done) {
        var config, stream, errors, stylesheet;

        stylesheet = {
            fixture: path.resolve(fixtures, 'stylesheet.css'),
            expectation: path.resolve(expectations, 'stylesheet.css')
        };

        errors = [];

        config = {
            src:        [],
            engine:     "auto",
            algorithm:  "top-down",
            padding:    0,
            engineOpts: {},
            exportOpts: {},

            baseUrl:         fixtures,
            spriteSheetName:  "sprite.png",
            styleSheetName: "stylesheet.sprite.css",
            spriteSheetPath: null,
            filter: [],
            groupBy: []
        };

        stream = sprite(config);

        stream.img.on('data', function (file) {
            try {
                assert.equal(file.path, config.spriteSheetName);
            } catch (err) {
                errors.push(err);
            }
        });

        stream.css.on('data', function (file) {
            try {
                assert.equal(file.contents.toString(), fs.readFileSync(stylesheet.expectation).toString());
                assert.equal(file.path, config.styleSheetName);
            } catch (err) {
                errors.push(err);
            }
        });

        stream.write(new File({
            base:     test,
            path:     stylesheet.fixture,
            contents: new Buffer(fs.readFileSync(stylesheet.fixture))
        }));

        stream.on('finish', function() {
            done(errors[0]);
        });

        stream.end();
    });

    it("Should create sprite for retina and change refs in stylesheet", function(done) {
        var config, stream, errors,
            stylesheet;

        stylesheet = {
            fixture: path.resolve(fixtures, 'stylesheet.retina.css'),
            expectation: path.resolve(expectations, 'stylesheet.retina.css')
        };

        errors = [];

        config = {
            src:        [],
            engine:     "auto",
            algorithm:  "top-down",
            padding:    0,
            engineOpts: {},
            exportOpts: {},

            baseUrl:         fixtures,
            spriteSheetName: "sprite.png",
            styleSheetName:  "stylesheet.sprite.css",
            spriteSheetPath: null,
            filter:          [],
            groupBy:         []
        };

        stream = sprite(config);

        stream.img.on('data', function (file) {
            try {
                assert.equal(file.path, 'sprite.@2x.png');
            } catch (err) {
                errors.push(err);
            }
        });

        stream.css.on('data', function (file) {
            try {
                assert.equal(file.contents.toString(), fs.readFileSync(stylesheet.expectation).toString());
                assert.equal(file.path, config.styleSheetName);
            } catch (err) {
                errors.push(err);
            }
        });

        stream.write(new File({
            base:     test,
            path:     stylesheet.fixture,
            contents: new Buffer(fs.readFileSync(stylesheet.fixture))
        }));

        stream.on('finish', function() {
            done(errors[0]);
        });

        stream.end();
    });

    it("Should create sprite using groupBy and change refs in stylesheet", function(done) {
        var config, stream, errors,
            stylesheet;

        stylesheet = {
            fixture: path.resolve(fixtures, 'stylesheet.css'),
            expectation: path.resolve(expectations, 'stylesheet.groupby.css')
        };

        errors = [];

        config = {
            src:        [],
            engine:     "auto",
            algorithm:  "top-down",
            padding:    0,
            engineOpts: {},
            exportOpts: {},

            baseUrl:         fixtures,
            spriteSheetName: "sprite.png",
            styleSheetName:  "stylesheet.sprite.css",
            spriteSheetPath: null,
            filter:          [],
            groupBy:         []
        };

        config.groupBy.push(function(image) {
            return "my";
        });

        stream = sprite(config);

        stream.img.on('data', function (file) {
            try {
                assert.equal(file.path, 'sprite.my.png');
            } catch (err) {
                errors.push(err);
            }
        });

        stream.css.on('data', function (file) {
            try {
                assert.equal(file.contents.toString(), fs.readFileSync(stylesheet.expectation).toString());
                assert.equal(file.path, config.styleSheetName);
            } catch (err) {
                errors.push(err);
            }
        });

        stream.write(new File({
            base:     test,
            path:     stylesheet.fixture,
            contents: new Buffer(fs.readFileSync(stylesheet.fixture))
        }));

        stream.on('finish', function() {
            done(errors[0]);
        });

        stream.end();
    });

    it("Should create sprite using filter and change refs in stylesheet", function(done) {
        var config, stream, errors,
            stylesheet;

        stylesheet = {
            fixture: path.resolve(fixtures, 'stylesheet.css'),
            expectation: path.resolve(expectations, 'stylesheet.filter.css')
        };

        errors = [];

        config = {
            src:        [],
            engine:     "auto",
            algorithm:  "top-down",
            padding:    0,
            engineOpts: {},
            exportOpts: {},

            baseUrl:         fixtures,
            spriteSheetName: "sprite.png",
            styleSheetName:  "stylesheet.sprite.css",
            spriteSheetPath: null,
            filter:          [],
            groupBy:         []
        };

        config.filter.push(function(image) {
            return image.url != "/a.png";
        });

        stream = sprite(config);

        stream.img.on('data', function (file) {
            try {
                assert.equal(file.path, 'sprite.png');
            } catch (err) {
                errors.push(err);
            }
        });

        stream.css.on('data', function (file) {
            try {
                assert.equal(file.contents.toString(), fs.readFileSync(stylesheet.expectation).toString());
                assert.equal(file.path, config.styleSheetName);
            } catch (err) {
                errors.push(err);
            }
        });

        stream.write(new File({
            base:     test,
            path:     stylesheet.fixture,
            contents: new Buffer(fs.readFileSync(stylesheet.fixture))
        }));

        stream.on('finish', function() {
            done(errors[0]);
        });

        stream.end();
    });

    it("Should create sprite reading meta in doc block and change refs in stylesheet", function(done) {
        var config, stream, errors,
            meta;

        errors = [];

        config = {
            baseUrl:         fixtures,
            spriteSheetName: "sprite.png",
            filter:          []
        };

        meta = {
            sprite: {
                some: true,
                prop: 1,
                yes: "no"
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
            base:     test,
            path:     path.resolve(fixtures, 'stylesheetdddd.css'),
            contents: new Buffer('.a { background-image: url("sprite.retina-2x.png"); /* @meta ' + JSON.stringify(meta) + ' */ }')
        }));

        stream.on('finish', function() {
            done(errors[0]);
        });

        stream.end();
    });

});

