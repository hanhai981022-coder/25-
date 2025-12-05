import React from 'react';

const LoadingSpinner: React.FC<{ message?: string }> = ({ message = "AI is preparing your vocabulary..." }) => {
  return (
    <div className="flex flex-col items-center justify-center h-64 p-8 text-center">
      <div className="relative w-16 h-16 mb-6">
        <div className="absolute top-0 left-0 w-full h-full border-4 border-indigo-200 rounded-full"></div>
        <div className="absolute top-0 left-0 w-full h-full border-4 border-indigo-600 rounded-full animate-spin border-t-transparent"></div>
      </div>
      <p className="text-gray-600 font-medium animate-pulse">{message}</p>
    </div>
  );
};

export default LoadingSpinner;