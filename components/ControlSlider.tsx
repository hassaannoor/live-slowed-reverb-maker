
import React from 'react';

type ControlSliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  displayValue: string;
};

export const ControlSlider: React.FC<ControlSliderProps> = ({ label, value, min, max, step, onChange, displayValue }) => (
  <div className="space-y-2">
    <div className="flex justify-between items-center">
      <label className="text-sm font-medium text-medium-text">{label}</label>
      <span className="text-sm font-mono bg-dark-input px-2 py-0.5 rounded text-light-text">{displayValue}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-2 bg-dark-input rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-brand-purple [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md"
    />
  </div>
);
