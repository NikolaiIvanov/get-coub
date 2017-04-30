# Get Coub

1. Yes, you get video with audio channel, not just video, that's why you need [FFprobe and FFmpeg](https://ffmpeg.org/download.html) binaries.
2. If video is shorter than audio, it will be looped to fit audio duration.
3. Output filename would be `coub_[video_id]_[mp4_filename].mp4`

### Usage
```javascript
var gc = new GetCoub('http://coub.com/view/dl5px', (progress) => {
   console.log(progress);
},(end) => {
   console.log(end);
},(error) => {
   console.log(error);
});
```

### Change Log
 - v1.0.7.20170501 - loading video and audio asynchronously 
 - v1.0.6.20170403