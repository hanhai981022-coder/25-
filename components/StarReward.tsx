import React from 'react';

const StarReward: React.FC = () => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm animate-fade-in-up"></div>
      <div className="relative flex gap-4">
        {/* Left Star */}
        <div className="animate-pop" style={{ animationDelay: '0.1s' }}>
           <svg className="w-24 h-24 text-yellow-400 drop-shadow-lg filter" fill="currentColor" viewBox="0 0 24 24">
             <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
           </svg>
        </div>
        {/* Center Star (Big) */}
        <div className="animate-pop -mt-8" style={{ animationDelay: '0.2s' }}>
           <svg className="w-32 h-32 text-yellow-500 drop-shadow-2xl filter" fill="currentColor" viewBox="0 0 24 24">
             <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
           </svg>
        </div>
        {/* Right Star */}
        <div className="animate-pop" style={{ animationDelay: '0.3s' }}>
           <svg className="w-24 h-24 text-yellow-400 drop-shadow-lg filter" fill="currentColor" viewBox="0 0 24 24">
             <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
           </svg>
        </div>
      </div>
      <div className="absolute mt-48 animate-pop" style={{ animationDelay: '0.4s' }}>
        <h2 className="text-4xl font-black text-white drop-shadow-lg tracking-wider" 
            style={{ textShadow: '0 4px 0 rgba(0,0,0,0.2)' }}>
          EXCELLENT!
        </h2>
      </div>
    </div>
  );
};

export default StarReward;