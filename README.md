# Get Coub
Tool helps you download coub video


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


### Required
FFProbe and FFMpeg
