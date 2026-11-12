class PCMRecorder extends AudioWorkletProcessor{
 constructor(){super();this.buffer=new Float32Array(1024);this.used=0;}
 process(inputs,outputs){const input=inputs[0]?.[0];if(input){for(let i=0;i<input.length;i++){this.buffer[this.used++]=input[i];if(this.used===this.buffer.length){this.port.postMessage(this.buffer,[this.buffer.buffer]);this.buffer=new Float32Array(1024);this.used=0;}}}for(const output of outputs)for(const channel of output)channel.fill(0);return true;}
}
registerProcessor('chronoshov-pcm',PCMRecorder);
