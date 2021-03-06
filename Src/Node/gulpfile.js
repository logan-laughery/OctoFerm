var gulp = require('gulp');
var prompt = require('gulp-prompt');
var gulpSsh = require('gulp-ssh');
var source = require('vinyl-source-stream');
var path = require('path');

var config = {
  host: '173.31.120.214',
  port: 2222,
  username: 'pi'
}

// var config = {
//   host: '173.31.120.214',
//   port: 2222,
//   username: 'pi'
// }

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
  return gulp.src(['./package.json', './octoferm-diagnostic.js',
    './.sequelizerc', './octoferm-manager.js',
    './octoferm-service.js', './octoferm-api.js',
    './data/**/*.*', './routes/**/*.*', //'./db/**/*.*',
    './service/**/*.*'], {base:__dirname})
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
