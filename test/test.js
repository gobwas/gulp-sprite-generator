var fs     = require('fs'),
    assert = require('chai').assert,
    File   = require('vinyl'),
    path   = require('path'),
    sprite = require('./../index'),
    gulp   = require('gulp');

describe('gulp-sprite-generator', function(){
    var test, fixtures, expectations, stylesheet, image;

    before(function(){
        test       = path.resolve(__dirname, '.');
        fixtures   = path.resolve(test, 'fixtures');
        expectations   = path.resolve(test, 'expectations');

        stylesheet = {
            fixture: path.resolve(fixtures, 'stylesheet.css'),
            expectation: path.resolve(expectations, 'stylesheet.css')
        };

        image = {
            expectation: path.resolve(expectations, 'sprite.png')
        };
    });

    it("Should create sprite and change refs in stylesheet", function(done) {
        var config, stream, errors;

        errors = [];

        config = {
            algorithm: "top-down",
            padding:   0,

            baseUrl:         fixtures,
            spriteSheetPath: "sprite.png",
            styleSheetPath:  "stylesheet.sprite.css"
        };

        stream = sprite(config);

        stream.img.on('data', function (file) {
            try {
                assert.equal(file.path, config.spriteSheetPath);
            } catch (err) {
                errors.push(err);
            }
        });

        stream.css.on('data', function (file) {
            try {
                assert.equal(file.contents.toString(), fs.readFileSync(stylesheet.expectation).toString());
                assert.equal(file.path, config.styleSheetPath);
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

});

