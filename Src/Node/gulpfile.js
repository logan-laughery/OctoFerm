var gulp = require('gulp');
var prompt = require('gulp-prompt');
var gulpSsh = require('gulp-ssh');
var browserify = require('browserify');
var source = require('vinyl-source-stream');

var config = {
  host: '192.168.2.169',
  port: 22,
  username: 'pi'
}

var sshConfig;
function setSshConfig(){
  sshConfig = new gulpSsh({
    ignoreErrors: false, 
    sshConfig: config
  });
}

gulp.task('password', function(){
  return gulp.src('.')
    .pipe(prompt.prompt({
      type: 'password',
      name: 'password',
      message: 'Enter password'
    }, function(res){
      config.password = res.password;
      setSshConfig();
    }));
//    .pipe(sshConfig.dest('~/temp'));
});

gulp.task('deploy', ['password'], function(){
  return gulp.src(['./package.json', './node-led-control.js', './octoferm-service.js', './octoferm-service.service'])
    .pipe(sshConfig.dest('/home/pi/temp/octoferm'));
});

gulp.task('default', ['deploy']);

gulp.task('install', ['deploy'], function(){
  return sshConfig
    .shell(['cd /home/pi/temp/octoferm', 'npm install'])
    .on('ssh2Data', function(chunk){
      process.stdout.write(chunk);
    });
});

gulp.task('browserify', ['deploy'], function() {
  return browserify('./node-led-control.js')
    .bundle()
    .pipe(source('bundle.js'))
    .pipe(gulp.dest('./build/'));
});