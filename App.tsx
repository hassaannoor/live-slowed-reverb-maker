
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ControlSlider } from './components/ControlSlider';
import { PlayIcon, PauseIcon, DownloadIcon, MusicIcon, UploadIcon, SpinnerIcon } from './components/icons';
import { createReverbImpulseResponse, encodeWAV } from './utils/audio';

type AudioNodes = {
  source: AudioBufferSourceNode;
  convolver: ConvolverNode;
  wetGain: GainNode;
  dryGain: GainNode;
  masterGain: GainNode;
};

const App: React.FC = () => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [waveform, setWaveform] = useState<number[]>([]);
  
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);

  const [speed, setSpeed] = useState<number>(0.85);
  const [reverbWet, setReverbWet] = useState<number>(0.4);
  const [reverbDecay, setReverbDecay] = useState<number>(2.5);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioNodesRef = useRef<AudioNodes | null>(null);
  const startOffsetRef = useRef<number>(0);
  const audioContextStartTimeRef = useRef<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopPlayback = useCallback(() => {
    if (audioNodesRef.current?.source) {
      audioNodesRef.current.source.onended = null; // Prevent onended from firing on manual stop
      try {
        audioNodesRef.current.source.stop();
      } catch (e) {
        // Ignore errors if the source is already stopped
      }
      audioNodesRef.current.source.disconnect();
    }
    audioNodesRef.current = null;
    setIsPlaying(false);
  }, []);

  const createAudioGraph = useCallback((): AudioNodes => {
    if (!audioContextRef.current || !audioBuffer) throw new Error("Audio context or buffer not ready");
    const audioContext = audioContextRef.current;

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = true;
    source.playbackRate.value = speed;

    const convolver = audioContext.createConvolver();
    const impulse = createReverbImpulseResponse(reverbDecay, audioContext);
    convolver.buffer = impulse;

    const wetGain = audioContext.createGain();
    wetGain.gain.value = reverbWet;

    const dryGain = audioContext.createGain();
    dryGain.gain.value = 1 - reverbWet;
    
    const masterGain = audioContext.createGain();

    source.connect(dryGain).connect(masterGain);
    source.connect(convolver).connect(wetGain).connect(masterGain);
    masterGain.connect(audioContext.destination);

    return { source, convolver, wetGain, dryGain, masterGain };
  }, [audioBuffer, speed, reverbWet, reverbDecay]);
  
  const startPlayback = useCallback((offset: number) => {
    if (!audioContextRef.current || !audioBuffer) return;

    const newNodes = createAudioGraph();
    audioNodesRef.current = newNodes;
    
    newNodes.source.onended = () => {
      if (audioNodesRef.current?.source === newNodes.source) {
         setCurrentTime(0);
         stopPlayback();
      }
    };

    newNodes.source.start(0, offset);
    startOffsetRef.current = offset;
    audioContextStartTimeRef.current = audioContextRef.current.currentTime;
    setIsPlaying(true);
  }, [audioBuffer, createAudioGraph, stopPlayback]);

  const togglePlayPause = useCallback(() => {
    if (!audioContextRef.current || !audioBuffer) return;
    
    if (isPlaying) {
      const elapsedTime = audioContextRef.current.currentTime - audioContextStartTimeRef.current;
      const newTime = (startOffsetRef.current + elapsedTime) % audioBuffer.duration;
      setCurrentTime(newTime);
      stopPlayback();
    } else {
      startPlayback(currentTime);
    }
  }, [isPlaying, audioBuffer, currentTime, startPlayback, stopPlayback]);

  useEffect(() => {
    let animationFrameId: number;
    const update = () => {
      if (audioContextRef.current && audioBuffer) {
        const elapsedTime = audioContextRef.current.currentTime - audioContextStartTimeRef.current;
        const newTime = (startOffsetRef.current + elapsedTime) % audioBuffer.duration;
        setCurrentTime(newTime);
      }
      animationFrameId = requestAnimationFrame(update);
    };

    if (isPlaying) {
      animationFrameId = requestAnimationFrame(update);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, audioBuffer]);

  useEffect(() => {
    if (isPlaying && audioNodesRef.current) {
      audioNodesRef.current.source.playbackRate.value = speed;
    }
  }, [speed, isPlaying]);

  useEffect(() => {
    if (isPlaying && audioNodesRef.current) {
      audioNodesRef.current.wetGain.gain.value = reverbWet;
      audioNodesRef.current.dryGain.gain.value = 1 - reverbWet;
    }
  }, [reverbWet, isPlaying]);

  useEffect(() => {
    if (isPlaying && audioNodesRef.current && audioContextRef.current) {
      const impulse = createReverbImpulseResponse(reverbDecay, audioContextRef.current);
      audioNodesRef.current.convolver.buffer = impulse;
    }
  }, [reverbDecay, isPlaying]);

  const drawWaveform = (buffer: AudioBuffer) => {
      const data = buffer.getChannelData(0);
      const samples = 200; // Number of bars in the waveform
      const blockSize = Math.floor(data.length / samples);
      const waveformData = [];
      for (let i = 0; i < samples; i++) {
          let blockStart = blockSize * i;
          let sum = 0;
          for (let j = 0; j < blockSize; j++) {
              sum += Math.abs(data[blockStart + j]);
          }
          waveformData.push(sum / blockSize);
      }
      const max = Math.max(...waveformData);
      setWaveform(waveformData.map(d => d / max));
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (isPlaying) {
      stopPlayback();
    }

    setFileName(file.name);
    setAudioBuffer(null);
    setWaveform([]);
    setCurrentTime(0);

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    const arrayBuffer = await file.arrayBuffer();
    const decodedBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
    setAudioBuffer(decodedBuffer);
    drawWaveform(decodedBuffer);
  };

  const handleSeek = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!audioBuffer || !audioContextRef.current) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const width = rect.width;
    const seekRatio = Math.max(0, Math.min(1, clickX / width));
    const newTime = seekRatio * audioBuffer.duration;

    setCurrentTime(newTime);

    if (isPlaying) {
      stopPlayback();
      startPlayback(newTime);
    }
  };
  
  const handleDownload = async () => {
    if (!audioBuffer) return;
    setIsRendering(true);

    if(isPlaying) stopPlayback();

    const offlineContext = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        audioBuffer.sampleRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = speed;
    
    const convolver = offlineContext.createConvolver();
    const impulse = createReverbImpulseResponse(reverbDecay, offlineContext);
    convolver.buffer = impulse;

    const wetGain = offlineContext.createGain();
    wetGain.gain.value = reverbWet;

    const dryGain = offlineContext.createGain();
    dryGain.gain.value = 1 - reverbWet;
    
    const masterGain = offlineContext.createGain();

    source.connect(dryGain).connect(masterGain);
    source.connect(convolver).connect(wetGain).connect(masterGain);
    masterGain.connect(offlineContext.destination);

    source.start(0);

    const renderedBuffer = await offlineContext.startRendering();
    const wavBlob = encodeWAV(renderedBuffer);

    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `slowed_reverb_${fileName || 'audio.wav'}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    
    setIsRendering(false);
  };

  return (
    <div className="min-h-screen bg-dark-bg text-light-text flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-dark-card rounded-2xl shadow-2xl p-6 space-y-6">
        <header className="text-center">
          <h1 className="text-2xl font-bold text-white">Slowed + Reverb Generator</h1>
          <p className="text-medium-text">Craft your perfect atmospheric sound</p>
        </header>

        <div 
          className="border-2 border-dashed border-dark-input rounded-xl p-6 text-center cursor-pointer hover:border-brand-purple hover:bg-gray-800/20 transition-all duration-300"
          onClick={() => fileInputRef.current?.click()}
        >
          <input type="file" accept="audio/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
          <div className="flex flex-col items-center justify-center space-y-2">
            <UploadIcon className="w-8 h-8 text-medium-text" />
            {fileName ? (
                <span className="text-brand-light truncate max-w-full">{fileName}</span>
            ) : (
                <p className="text-medium-text">Click to upload an audio file</p>
            )}
          </div>
        </div>
        
        {audioBuffer && (
          <>
            <div 
              className="bg-dark-input rounded-lg p-3 cursor-pointer"
              onClick={handleSeek}
            >
              <div className="relative h-16 w-full flex items-center justify-center space-x-0.5">
                  {waveform.map((val, i) => (
                      <div key={i} className="bg-brand-purple rounded-full" style={{ width: '2px', height: `${Math.max(4, val * 100)}%` }}></div>
                  ))}
                  {audioBuffer && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-red-500/80 pointer-events-none"
                      style={{ left: `calc(${(currentTime / audioBuffer.duration) * 100}% - 1px)` }}
                    >
                      <div className="absolute -top-1 -left-1 w-3 h-3 bg-red-500 rounded-full shadow-lg"></div>
                    </div>
                  )}
              </div>
            </div>

            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-center">Controls</h2>
              <ControlSlider label="Speed" value={speed} min={0.5} max={1.2} step={0.01} onChange={setSpeed} displayValue={`${(speed * 100).toFixed(0)}%`} />
              <ControlSlider label="Reverb Wetness" value={reverbWet} min={0} max={1} step={0.01} onChange={setReverbWet} displayValue={`${(reverbWet * 100).toFixed(0)}%`} />
              <ControlSlider label="Reverb Decay" value={reverbDecay} min={0.1} max={10} step={0.1} onChange={setReverbDecay} displayValue={`${reverbDecay.toFixed(1)}s`} />
            </section>
            
            <section className="flex items-center justify-center space-x-4">
                <button onClick={togglePlayPause} className="p-4 bg-brand-purple rounded-full text-white shadow-lg hover:bg-brand-light transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-light focus:ring-offset-2 focus:ring-offset-dark-card">
                  {isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
                </button>
                <button 
                  onClick={handleDownload}
                  disabled={isRendering}
                  className="px-6 py-3 bg-gray-600 rounded-full text-white font-semibold shadow-lg hover:bg-gray-500 transition-colors duration-200 flex items-center space-x-2 disabled:bg-gray-700 disabled:cursor-not-allowed disabled:text-medium-text"
                >
                  {isRendering ? (
                    <>
                      <SpinnerIcon className="w-5 h-5 animate-spin" />
                      <span>Rendering...</span>
                    </>
                  ) : (
                    <>
                      <DownloadIcon className="w-5 h-5" />
                      <span>Download</span>
                    </>
                  )}
                </button>
            </section>
          </>
        )}

        {!audioBuffer && !fileName && (
          <div className="flex flex-col items-center justify-center text-center p-8 space-y-4 text-medium-text">
            <MusicIcon className="w-16 h-16" />
            <p>Upload a track to begin the magic.</p>
          </div>
        )}

      </div>
    </div>
  );
};

export default App;
