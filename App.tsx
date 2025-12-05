import React, { useState, useEffect, useRef } from 'react';
import { WordCard, AppStatus, MistakeRecord } from './types';
import { fetchWordBatch, playPronunciation, preloadAudio } from './services/geminiService';
import Button from './components/Button';
import LoadingSpinner from './components/LoadingSpinner';
import StarReward from './components/StarReward';

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [words, setWords] = useState<WordCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mistakes, setMistakes] = useState<MistakeRecord[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  
  // New States for "Second Chance" and "Rewards"
  const [wrongCandidates, setWrongCandidates] = useState<string[]>([]);
  const [showReward, setShowReward] = useState(false);

  // Review System State
  const [reviewWord, setReviewWord] = useState<MistakeRecord | null>(null);
  const [wordsSinceReview, setWordsSinceReview] = useState(0);
  const [nextReviewThreshold, setNextReviewThreshold] = useState(10); // Start reviewing after 10 words

  // Background Fetching Ref
  const initFetchPromise = useRef<Promise<WordCard[]> | null>(null);

  // Load mistakes from local storage and start background fetch
  useEffect(() => {
    const savedMistakes = localStorage.getItem('kaoyan_mistakes');
    if (savedMistakes) {
      setMistakes(JSON.parse(savedMistakes));
    }

    // Start fetching immediately on mount to speed up entry
    initFetchPromise.current = fetchWordBatch();
  }, []);

  // Save mistakes
  useEffect(() => {
    localStorage.setItem('kaoyan_mistakes', JSON.stringify(mistakes));
  }, [mistakes]);

  // Audio Preloading Logic
  useEffect(() => {
    const activeWord = reviewWord || words[currentIndex];
    
    if (activeWord) {
      // 1. Preload word pronunciation (US accent)
      preloadAudio(activeWord.word);
      // 2. Preload sentence audio (Faster playback when clicked)
      preloadAudio(activeWord.sentence);

      // 3. Look ahead to next regular word
      if (!reviewWord && words[currentIndex + 1]) {
        preloadAudio(words[currentIndex + 1].word);
      }
    }
  }, [words, currentIndex, reviewWord]);

  const startSession = async () => {
    setStatus(AppStatus.LOADING);
    try {
      let newWords: WordCard[];
      
      // Use the background promise if it exists and hasn't been consumed yet
      if (initFetchPromise.current) {
        newWords = await initFetchPromise.current;
        initFetchPromise.current = null; // Clear it so we don't reuse stale data later
      } else {
        newWords = await fetchWordBatch();
      }

      setWords(newWords);
      setCurrentIndex(0);
      setReviewWord(null);
      setWordsSinceReview(0);
      resetCardState();
      setStatus(AppStatus.QUIZ);
    } catch (e) {
      console.error(e);
      alert("Failed to load words. Please check your connection or API key.");
      setStatus(AppStatus.IDLE);
      // Reset the promise so user can try again
      initFetchPromise.current = null;
    }
  };

  const resetCardState = () => {
    setSelectedOption(null);
    setWrongCandidates([]);
    setShowReward(false);
  };

  const handleAudioPlay = async (text: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isLoadingAudio) return;
    setIsLoadingAudio(true);
    await playPronunciation(text);
    setIsLoadingAudio(false);
  };

  // Determine current active card data (New Word or Review Word)
  const activeCard = reviewWord || words[currentIndex];

  const handleAnswer = (option: string) => {
    if (!activeCard) return;

    // Check if correct
    if (option === activeCard.meaning) {
      // --- CORRECT ---
      setShowReward(true);
      
      // If this was a review word, update mastery logic
      if (reviewWord) {
        setMistakes(prev => prev.map(m => {
          if (m.word === reviewWord.word) {
            return { ...m, consecutiveCorrect: (m.consecutiveCorrect || 0) + 1 };
          }
          return m;
        }));
      }

      setTimeout(() => {
        setShowReward(false);
        setSelectedOption(option);
        setStatus(AppStatus.REVIEW);
      }, 1500); 
      
    } else {
      // --- INCORRECT ---
      if (wrongCandidates.length === 0) {
        // First mistake: Give a second chance
        setWrongCandidates(prev => [...prev, option]);
      } else {
        // Second mistake: Fail
        setSelectedOption(option);
        setStatus(AppStatus.REVIEW);
        
        // Handle Mistake Logic
        if (reviewWord) {
           // If reviewing, reset consecutive correct to 0
           setMistakes(prev => prev.map(m => {
             if (m.word === reviewWord.word) {
               return { ...m, consecutiveCorrect: 0 };
             }
             return m;
           }));
        } else {
          // If new word, add to mistakes if not exists
          addToMistakes(activeCard);
        }
      }
    }
  };

  const addToMistakes = (wordToAdd: WordCard) => {
    setMistakes(prev => {
      if (prev.some(m => m.word === wordToAdd.word)) return prev;
      return [{ ...wordToAdd, timestamp: Date.now(), consecutiveCorrect: 0 }, ...prev];
    });
  };

  const nextWord = () => {
    resetCardState();

    // Check if we just finished a review card
    if (reviewWord) {
      setReviewWord(null);
      // Resume regular flow, do not increment wordsSinceReview
      setStatus(AppStatus.QUIZ);
      return;
    }

    // Regular flow
    const nextCounter = wordsSinceReview + 1;
    setWordsSinceReview(nextCounter);

    // Check if we should trigger a review (randomly between 10-20 words)
    // And ensure we have mistakes to review that aren't mastered yet
    const reviewCandidates = mistakes.filter(m => (m.consecutiveCorrect || 0) < 3);

    if (nextCounter >= nextReviewThreshold && reviewCandidates.length > 0) {
      // Trigger Review
      const randomIndex = Math.floor(Math.random() * reviewCandidates.length);
      setReviewWord(reviewCandidates[randomIndex]);
      
      // Reset counter and pick new threshold (10-20)
      setWordsSinceReview(0);
      setNextReviewThreshold(Math.floor(Math.random() * 11) + 10); 
      
      setStatus(AppStatus.QUIZ);
      return;
    }

    // Normal Next Word logic
    if (currentIndex < words.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setStatus(AppStatus.QUIZ);
    } else {
      // Fetch next batch
      setStatus(AppStatus.LOADING);
      fetchWordBatch().then(newWords => {
          setWords(newWords);
          setCurrentIndex(0);
          setStatus(AppStatus.QUIZ);
      }).catch(e => {
          console.error(e);
          setStatus(AppStatus.IDLE);
      });
    }
  };

  const removeMistake = (wordToRemove: string) => {
    setMistakes(prev => prev.filter(m => m.word !== wordToRemove));
  };

  // --- Renders ---

  const renderWelcome = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-fade-in">
      <div className="text-center space-y-4">
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
            Kaoyan Master 2025
          </span>
        </h1>
        <p className="text-lg text-gray-600 max-w-md mx-auto">
          High-frequency vocabulary. AI-powered mnemonics. <br/> 
          Ace the English exam with smart practice.
        </p>
      </div>
      
      <div className="flex flex-col w-full max-w-xs space-y-4">
        <Button onClick={startSession} className="w-full text-lg shadow-xl shadow-indigo-200/50">
          Start Training
        </Button>
        <Button 
          variant="secondary" 
          onClick={() => setStatus(AppStatus.MISTAKES)} 
          className="w-full"
          disabled={mistakes.length === 0}
        >
          Mistake Notebook ({mistakes.length})
        </Button>
      </div>
    </div>
  );

  const renderQuiz = () => {
    if (!activeCard) return null;
    
    return (
      <div className="w-full max-w-xl mx-auto space-y-8 animate-fade-in-up relative">
        {showReward && <StarReward />}
        
        {/* Progress Bar (Only show for regular batch progress) */}
        {!reviewWord && (
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-indigo-600 h-2 rounded-full transition-all duration-300" 
              style={{ width: `${((currentIndex) / words.length) * 100}%` }}
            ></div>
          </div>
        )}
        
        {reviewWord && (
            <div className="flex items-center justify-center gap-2 mb-[-20px]">
                <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider animate-pulse">
                    Reviewing Mistake
                </span>
            </div>
        )}

        {/* Word Card */}
        <div className="bg-white rounded-3xl shadow-xl p-8 text-center space-y-6 relative overflow-hidden transition-all">
          <div className={`absolute top-0 left-0 w-full h-2 ${reviewWord ? 'bg-orange-500' : 'bg-gradient-to-r from-indigo-500 to-purple-500'}`}></div>
          
          <div className="space-y-2">
            <h2 className="text-5xl font-bold text-gray-800 tracking-wide">{activeCard.word}</h2>
            <div className="flex items-center justify-center gap-3">
              <span className="text-gray-500 font-mono text-xl">/{activeCard.phonetic}/</span>
              <button 
                onClick={(e) => handleAudioPlay(activeCard.word, e)}
                disabled={isLoadingAudio}
                className="p-3 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-all hover:scale-105 active:scale-95"
                title="Play US Pronunciation"
              >
                {isLoadingAudio ? (
                  <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 gap-4">
          {activeCard.options.map((option, idx) => {
            const isWrong = wrongCandidates.includes(option);
            return (
              <button
                key={idx}
                onClick={() => !isWrong && handleAnswer(option)}
                disabled={isWrong || showReward}
                className={`
                  group p-5 rounded-xl border-2 transition-all text-left flex items-center justify-between
                  ${isWrong 
                    ? 'bg-red-50 border-red-200 text-red-400 cursor-not-allowed animate-shake' 
                    : 'bg-white border-transparent hover:border-indigo-100 hover:shadow-md hover:scale-[1.01] active:scale-[0.99]'}
                `}
              >
                <span className={`font-medium text-lg ${isWrong ? 'line-through' : 'text-gray-700'}`}>
                  {option}
                </span>
                
                {isWrong && (
                   <span className="text-red-500 font-bold text-sm">Try Again</span>
                )}
                
                {!isWrong && (
                  <span className="opacity-0 group-hover:opacity-100 text-indigo-400 transition-opacity">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                  </span>
                )}
              </button>
            );
          })}
        </div>
        
        {wrongCandidates.length > 0 && wrongCandidates.length < 2 && (
            <div className="text-center text-red-500 font-medium animate-pulse">
                Incorrect. You have one more chance!
            </div>
        )}
      </div>
    );
  };

  const renderReview = () => {
    if (!activeCard) return null;
    const isCorrect = selectedOption === activeCard.meaning;
    const isInMistakes = mistakes.some(m => m.word === activeCard.word);
    
    // Check if mastered (used for display message in review mode)
    const isMastered = reviewWord && (reviewWord.consecutiveCorrect || 0) + 1 >= 3 && isCorrect;

    return (
      <div className="w-full max-w-xl mx-auto space-y-6 animate-fade-in-up">
        <div className={`rounded-3xl shadow-xl p-8 text-center space-y-6 relative overflow-hidden ${isCorrect ? 'bg-green-50' : 'bg-red-50'}`}>
           <div className={`absolute top-0 left-0 w-full h-2 ${isCorrect ? 'bg-green-500' : 'bg-red-500'}`}></div>
           
           <div className="flex flex-col items-center">
             {/* Status Icon */}
             <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 ${isCorrect ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
               {isCorrect ? (
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
               ) : (
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
               )}
             </div>
             
             {/* Word Display (Replacing generic 'Excellent' message) */}
             <div className="mb-4 text-center">
                 <h2 className="text-4xl font-extrabold text-gray-900 tracking-tight">{activeCard.word}</h2>
                 <div className="flex items-center justify-center gap-2 mt-2">
                     <span className="text-gray-500 font-mono text-lg">/{activeCard.phonetic}/</span>
                     <button 
                        onClick={() => handleAudioPlay(activeCard.word)}
                        className="p-2 bg-indigo-100 rounded-full text-indigo-600 hover:bg-indigo-200 transition-colors"
                        title="Listen"
                     >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>
                     </button>
                 </div>
                 
                 {/* Feedback Subtitle */}
                 <div className="mt-2 text-sm font-semibold h-6">
                    {isMastered && <span className="text-green-600">Word Mastered! Removed from notebook.</span>}
                    {reviewWord && isCorrect && !isMastered && <span className="text-green-600">Streak: {(reviewWord.consecutiveCorrect || 0) + 1} / 3</span>}
                    {!isCorrect && <span className="text-red-500">Added to Mistake Notebook</span>}
                 </div>
             </div>

             <div className="text-gray-600 mb-6">
                Correct meaning: <br/>
                <span className="font-bold text-gray-900 text-xl block mt-2">{activeCard.meaning}</span>
             </div>

             {/* Mnemonic Section */}
             <div className="bg-white p-5 rounded-xl w-full text-left shadow-sm border border-gray-100 mb-4">
                <div className="flex items-center gap-2 mb-2">
                    <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded uppercase tracking-wider">Mnemonic</span>
                </div>
                <p className="text-gray-800 text-lg font-medium leading-relaxed">{activeCard.mnemonic}</p>
             </div>

             {/* Example Section */}
             <div className="bg-white p-5 rounded-xl w-full text-left shadow-sm border border-gray-100">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Example</h3>
                <p className="text-indigo-900 font-medium italic mb-1 text-lg">"{activeCard.sentence}"</p>
                <p className="text-gray-500">{activeCard.sentenceTranslation}</p>
                <div className="mt-3 flex justify-end">
                     <button 
                        onClick={() => handleAudioPlay(activeCard.sentence)}
                        className="text-sm text-indigo-500 hover:text-indigo-700 flex items-center gap-1 font-semibold"
                     >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>
                        Read Sentence
                     </button>
                </div>
             </div>
           </div>
        </div>

        <div className="space-y-3">
            <Button onClick={nextWord} className="w-full text-lg shadow-lg shadow-indigo-200">
            {reviewWord 
                ? 'Continue' 
                : (currentIndex < words.length - 1 ? 'Next Word →' : 'Load Next Batch')}
            </Button>
            
            {/* Manual Add to Mistake Notebook Button */}
            {!reviewWord && !isInMistakes && (
                <Button 
                    variant="secondary" 
                    onClick={() => addToMistakes(activeCard)} 
                    className="w-full border-dashed"
                >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                    Manually Add to Notebook
                </Button>
            )}
            
            {!reviewWord && isInMistakes && (
                 <div className="text-center text-sm text-gray-400 font-medium p-2">
                    ✓ Saved in notebook
                 </div>
            )}
        </div>
      </div>
    );
  };

  const renderMistakes = () => (
    <div className="w-full max-w-2xl mx-auto h-[80vh] flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Mistake Notebook</h2>
        <Button variant="ghost" onClick={() => setStatus(AppStatus.IDLE)}>Close</Button>
      </div>

      {mistakes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
          <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          <p>No mistakes recorded yet. Good job!</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-hide">
          {mistakes.map((m, idx) => (
            <div key={`${m.word}-${idx}`} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-xl font-bold text-gray-900">{m.word}</h3>
                    <span className="text-gray-500 font-mono text-sm">/{m.phonetic}/</span>
                    {(m.consecutiveCorrect || 0) > 0 && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">
                            Streak: {m.consecutiveCorrect}
                        </span>
                    )}
                  </div>
                  <p className="text-indigo-600 font-semibold mt-1">{m.meaning}</p>
                </div>
                <button 
                  onClick={() => removeMistake(m.word)}
                  className="text-gray-300 hover:text-red-500 transition-colors p-1"
                  title="Remove from notebook"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
              </div>
              
              <div className="bg-yellow-50 p-3 rounded-lg mb-3 border border-yellow-100">
                <span className="text-xs font-bold text-yellow-700 uppercase tracking-wide">Memory Aid</span>
                <p className="text-gray-800 text-sm mt-1">{m.mnemonic}</p>
              </div>
              
              <div className="flex gap-4 items-center mt-3">
                 <button 
                    onClick={() => handleAudioPlay(m.word)}
                    className="text-indigo-600 text-sm font-medium hover:underline flex items-center gap-1"
                 >
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>
                   Pronunciation
                 </button>
                 <button 
                    onClick={() => handleAudioPlay(m.sentence)}
                    className="text-indigo-600 text-sm font-medium hover:underline flex items-center gap-1"
                 >
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                   Sentence
                 </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans p-4 md:p-8 flex flex-col">
      {/* Top Bar */}
      <div className="w-full max-w-4xl mx-auto flex justify-between items-center mb-8">
        <div className="flex items-center gap-2 cursor-pointer transition-transform active:scale-95" onClick={() => setStatus(AppStatus.IDLE)}>
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-md">K</div>
          <span className="font-bold text-xl tracking-tight hidden md:block text-gray-800">KaoyanMaster</span>
        </div>
        {status !== AppStatus.MISTAKES && status !== AppStatus.IDLE && (
          <Button variant="secondary" onClick={() => setStatus(AppStatus.MISTAKES)} className="py-2 px-4 text-sm">
            Mistakes ({mistakes.length})
          </Button>
        )}
      </div>

      {/* Main Content Area */}
      <main className="w-full max-w-4xl mx-auto flex-1 flex flex-col relative">
        {status === AppStatus.IDLE && renderWelcome()}
        {status === AppStatus.LOADING && <LoadingSpinner />}
        {status === AppStatus.QUIZ && renderQuiz()}
        {status === AppStatus.REVIEW && renderReview()}
        {status === AppStatus.MISTAKES && renderMistakes()}
      </main>
      
      {/* Footer */}
      <footer className="w-full text-center py-6 text-gray-400 text-sm mt-auto">
        © 2025 Kaoyan English Preparation • Powered by Gemini AI
      </footer>
    </div>
  );
};

export default App;