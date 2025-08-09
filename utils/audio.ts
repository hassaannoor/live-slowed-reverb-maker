
export function createReverbImpulseResponse(decay: number, audioContext: AudioContext | OfflineAudioContext): AudioBuffer {
  const sampleRate = audioContext.sampleRate;
  const length = sampleRate * decay;
  const impulse = audioContext.createBuffer(2, length, sampleRate);
  
  for (let i = 0; i < 2; i++) {
    const channel = impulse.getChannelData(i);
    for (let j = 0; j < length; j++) {
      channel[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / length, 2.5);
    }
  }
  
  return impulse;
}

export function encodeWAV(buffer: AudioBuffer): Blob {
  const numOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  let result: Float32Array;
  if (numOfChannels === 2) {
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    result = new Float32Array(left.length + right.length);
    for (let i = 0, j = 0; i < left.length; i++) {
      result[j++] = left[i];
      result[j++] = right[i];
    }
  } else {
    result = buffer.getChannelData(0);
  }
  
  const samples = result;
  const dataLength = samples.length * (bitDepth / 8);
  const bufferLength = 44 + dataLength;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);
  
  function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
  
  let offset = 0;
  // RIFF header
  writeString(view, offset, 'RIFF'); offset += 4;
  view.setUint32(offset, 36 + dataLength, true); offset += 4;
  writeString(view, offset, 'WAVE'); offset += 4;
  
  // "fmt " sub-chunk
  writeString(view, offset, 'fmt '); offset += 4;
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, format, true); offset += 2;
  view.setUint16(offset, numOfChannels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * numOfChannels * (bitDepth / 8), true); offset += 4;
  view.setUint16(offset, numOfChannels * (bitDepth / 8), true); offset += 2;
  view.setUint16(offset, bitDepth, true); offset += 2;
  
  // "data" sub-chunk
  writeString(view, offset, 'data'); offset += 4;
  view.setUint32(offset, dataLength, true); offset += 4;
  
  // Write the PCM samples
  let sample;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
  }
  
  return new Blob([view], { type: 'audio/wav' });
}
