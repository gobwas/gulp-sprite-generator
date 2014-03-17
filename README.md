# [gulp](http://gulpjs.com)-sprite-generator

> Generate sprites from stylesheets.

Plugin that generate sprites from your stylesheets (using [spritesmith](https://github.com/Ensighten/spritesmith)) and then updates image references.

## Install

Install with [npm](https://npmjs.org/package/gulp-sprite-generator)

```
npm install --save-dev gulp-sprite-generator
```


## Example

```js
var gulp = require('gulp');
var changed = require('gulp-sprite-generator');

var SRC = 'src/*.css';
var DEST = 'dist';

gulp.task('default', function () {
	gulp.src(SRC)
		.pipe(changed(DEST))
		// ngmin will only get the files that
		// changed since the last time it was run
		.pipe(ngmin())
		.pipe(gulp.dest(DEST));
});
```

## API

### changed(dest, options)

#### dest

Type: `String`

The destination directory. Same as you put into `gulp.dest()`.

This is needed to be able to compare the current files with the destination files.

#### options

Type: `Object`

Set `options.extension` value to specify extension of the destination files.

```
gulp.task('jade', function() {
	gulp.src('./src/**/*.jade')
		.pipe(changed('./app/', { extension: '.html' }))
		.pipe(jade())
		.pipe(gulp.dest('./app/'))
});
```

## License

MIT © [Sindre Sorhus](http://sindresorhus.com)

