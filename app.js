/**
 * GetCoub (v1.0.6.20170403), http://tpkn.me/
 */

const os          = require('os');
const fs          = require('fs');
const path        = require('path');
const mkdirp      = require('mkdirp');
const exec        = require('child_process').exec;
const request     = require('request');
const cheerio     = require('cheerio');

const ffmpeg      = path.join(process.cwd(), 'bin', 'ffmpeg.exe');
const ffprobe     = path.join(process.cwd(), 'bin', 'ffprobe.exe');
const temp_folder = path.join(process.cwd(), 'temp');
const save_folder = path.join(os.homedir(), os.platform() === 'win32' ? '/Desktop/' : '/');


class GetCoub {
   constructor(link, on_progress, on_complete, on_error){
      this.link = link;
      this.coub_id = path.basename(link);

      this.on_progress = typeof on_progress === 'function' ? on_progress : (e => {});
      this.on_complete = typeof on_complete === 'function' ? on_complete : (e => {});
      this.on_error = typeof on_error === 'function' ? on_error : (e => {});

      mkdirp.sync(temp_folder);

      this.loadCoub(link);
   }

   /**
    * Looking for highest quality file
    * @param  {Array} list
    * @return {String}
    */
   getHighestQuality(list){
      if(list.high){
         return list.high.url;
      }else if(list.med){
         return list.med.url;
      }else if(list.low){
         return list.low.url;
      }
   }

   /**
    * Make ffprobe fps output looks like normal fps (60/2 to 30)
    * If something went wrong while converting, it returns 0
    * 
    * @param  {String} str
    * @return {Number}
    */
   stringToFps(str){
      let parts = str.split('/');
      let division = parts.length == 1 ? Number(str) : Number(parts[0]) / Number(parts[1]);
      return division === Infinity || isNaN(division) ? 0 : division;
   }

   /**
    * Load coub
    * @param  {String} link
    */
   loadCoub(link){
      request(link, {encoding: 'utf8'}, (error, response, buffer) => {
         if (error || response.statusCode !== 200){
            return this.on_error('Error while loading coub page: ' + error);
         }

         let $ = cheerio.load(buffer, {normalizeWhitespace: false, xmlMode: false, decodeEntities: true});
         let json = JSON.parse($('#coubPageCoubJson').text());

         let video_link = this.getHighestQuality(json.file_versions.html5.video);
         let audio_link = this.getHighestQuality(json.file_versions.html5.audio);
         let thumb_link = json.image_versions.template.replace('%{version}', 'small');
         let video_path = path.join(temp_folder, path.basename(video_link));
         let audio_path = path.join(temp_folder, path.basename(audio_link));
         let thumb_path = path.join(temp_folder, path.basename(thumb_link));

         this.on_progress('Loading video...');

         /**
          * Download video file
          */
         request(video_link, {encoding: 'binary'}, (error, response, buffer) => {
            if(error || response.statusCode != 200){
               return this.on_error('Error while downloading video: ' + this.link);
            }

            fs.writeFileSync(video_path, buffer, 'binary');
            this.on_progress('Video is loaded: ' + video_link);
            this.on_progress('Loading audio...');

            /**
             * Download audio file
             */
            request(audio_link, {encoding: 'binary'}, (error, response, buffer) => {
               if(error || response.statusCode !== 200){
                  return this.on_error('Error while downloading audio: ' + this.link);
               }

               fs.writeFileSync(audio_path, buffer, 'binary');
               this.on_progress('Audio file is loaded: ' + audio_link);
               this.on_progress('Loading thumbnail...');

               /**
                * Download thumb file
                */
               request(thumb_link, {encoding: 'binary'}, (error, response, buffer) => {
                  if(error || response.statusCode !== 200){
                     this.on_error('Error while downloading thumbnail: ' + this.link);
                  }
                  
                  // fs.writeFileSync(thumb_path, buffer, 'binary');
                  this.on_progress('Thumb image is loaded: ' + thumb_link);

                  /**
                   * Finally merge files
                   */
                  this.mergeFiles(video_path, audio_path, thumb_path);
               });
            });
         });
      });
   }

   /**
    * GetCoub
    * @param {String} video
    * @param {String} params
    */
   mergeFiles(video_path, audio_path, thumb_path){
      if(!video_path || !audio_path){
         return this.on_error('Error while getting video info: ' + error);
      }

      let video_info = {};
      let audio_info = {};

      /**
       * Using temporary 'coub_id.txt' file for video paths. Why?
       * Because if we will concatenate 0.5 sec long video and 400 sec audio, 
       * we would get super long cmd string and 'ENAMETOOLONG' error as a result
       */
      let concat_list_path = path.join(temp_folder, this.coub_id + '.txt');


      /**
       * Extracting video info
       */
      let cmd = ffprobe + ' -v quiet -print_format json -show_format -show_streams ' + video_path;
      exec(cmd, (error, stdout, stderr) => {
         if(error){
            return this.on_error('Error while extracting video info: ' + error);
         }

         let info_json  = JSON.parse(stdout);
         let filename   = path.basename(video_path);
         let stream     = info_json.streams[0];
         let codec_name = stream.codec_name;
         let bit_rate   = (stream.bit_rate / 1000).toFixed(3);
         let fps        = this.stringToFps(stream.r_frame_rate);
         let width      = stream.width;
         let height     = stream.height;
         let duration   = Number(stream.duration);

         video_info = {path: path.join(temp_folder, filename), filename: filename, codec: codec_name, duration: duration, bit_rate: bit_rate, fps: fps, width: width, height: height};

         this.on_progress('Video info: ' + codec_name + ', ' + width + 'x' + height + ', ' + duration + 's' + ', ' + bit_rate + 'kbps' + ', ' + fps + 'fps');

         
         /**
          * Extracting audio info
          */
         let cmd = ffprobe + ' -v quiet -print_format json -show_format -show_streams ' + audio_path;
         exec(cmd, (error, stdout, stderr) => {
            if(error){
               return this.on_error('Error while extracting audio info: ' + error);
            }

            let info_json   = JSON.parse(stdout);
            let filename    = path.basename(audio_path);
            let stream      = info_json.streams[0];
            let codec_name  = stream.codec_name;
            let bit_rate    = Math.round(stream.bit_rate / 1000);
            let sample_rate = stream.sample_rate;
            let duration    = Number(stream.duration);

            audio_info = {path: path.join(temp_folder, filename), filename: filename, codec: codec_name, duration: duration, bit_rate: bit_rate, sample_rate: sample_rate};

            this.on_progress('Audio info: ' + codec_name + ', ' + duration + 's' + ', ' + bit_rate + 'kbps, ' + sample_rate + 'Hz');


            /**
             * Converting video into .ts file so we could 'loop' short video by merging same .ts file multiple times
             * Method works when video and audio has same duration too
             */
            let cmd = ffmpeg + ' -i ' + video_info.path + ' -c copy -bsf:v h264_mp4toannexb -f mpegts -y ' + video_info.path + '.ts';
            exec(cmd, (error, stdout, stderr) => {
               if(error){
                  return this.on_error('Error while making .ts file: ' + error);
               }

               this.on_progress('Temp .ts file is ready: ' + video_info.path + '.ts');
               this.on_progress('Merging .ts files...');


               /**
                * Create 'coub_id.txt' file and fill it up
                */
               let loop_str = '';
               let loops_count = Math.floor(audio_info.duration / video_info.duration) || 1;
               for(var i = 0; i < loops_count; i++){
                  loop_str += 'file \'' + video_info.path.replace(/\\/g, '/') + '.ts\'' + (i != loops_count - 1 ? '\n' : '');
               }
               fs.writeFileSync(concat_list_path, loop_str);

               let cmd = ffmpeg + ' -f concat -safe 0 -i ' + concat_list_path + ' -c copy ' + video_info.path + '.mp4';
               exec(cmd, (error, stdout, stderr) => {
                  if(error){
                     return this.on_error('Error while merging videos: ' + error);
                  }

                  this.on_progress('Merged into a single video: ' + video_info.path + '.mp4');
                  this.on_progress('Adding audio stream...');


                  /**
                   * Adding sound to .mp4 and saving full video
                   */
                  let coub_path = path.join(save_folder, 'coub_' + this.coub_id + '_' + path.basename(video_path));
                  
                  let cmd = ffmpeg + ' -i ' + video_info.path + '.mp4 -i ' + audio_info.path + ' -codec copy -shortest -y ' + coub_path;
                  exec(cmd, (error, stdout, stderr) => {
                     if(error){
                        return this.on_error('Error while adding sound: ' + error);
                     }

                     this.on_progress('Removing temporary files...');


                     /**
                      * Remove temp files
                      */
                     fs.unlinkSync(video_info.path + '.ts');
                     fs.unlinkSync(video_info.path + '.mp4');
                     fs.unlinkSync(video_info.path);
                     fs.unlinkSync(audio_info.path);
                     fs.unlinkSync(concat_list_path);

                     this.on_complete('Completed: ' + video_info.path + '.mp4');
                  });
               });
            });
         });
      });
   }
}

var gc = new GetCoub('http://coub.com/view/dl5px', (progress) => {
   console.log(progress);
},(end) => {
   console.log(end);
},(error) => {
   console.log(error);
});