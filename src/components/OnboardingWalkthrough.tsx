import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, MapPin, Camera, Shield, ChevronRight, Check, Globe } from 'lucide-react';

interface OnboardingWalkthroughProps {
  onComplete: () => void;
}

export const OnboardingWalkthrough: React.FC<OnboardingWalkthroughProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      id: 'welcome',
      title: 'Welcome to Civisha',
      description: 'Your platform to report, track, and resolve local issues together with your community.',
      icon: <Globe className="w-16 h-16 text-indigo-500 mb-6" />,
      color: 'bg-indigo-50 dark:bg-indigo-900/20'
    },
    {
      id: 'map',
      title: 'Explore Your Area',
      description: 'Use the Radar Map to see what is happening around you. Drop a pin to explore different neighborhoods.',
      icon: <MapPin className="w-16 h-16 text-rose-500 mb-6" />,
      color: 'bg-rose-50 dark:bg-rose-900/20'
    },
    {
      id: 'report',
      title: 'Report Issues',
      description: 'Spotted a pothole or a broken street light? Tap the + button, snap a photo, and alert your community instantly.',
      icon: <Camera className="w-16 h-16 text-emerald-500 mb-6" />,
      color: 'bg-emerald-50 dark:bg-emerald-900/20'
    },
    {
      id: 'safety',
      title: 'Stay Safe & Anonymous',
      description: 'Your safety matters. You can report anonymously, and community confirmations help verify issues to build trust.',
      icon: <Shield className="w-16 h-16 text-blue-500 mb-6" />,
      color: 'bg-blue-50 dark:bg-blue-900/20'
    }
  ];

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const isLastStep = currentStep === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden relative"
      >
        {/* Skip Button */}
        <button
          onClick={onComplete}
          className="absolute top-4 right-4 z-10 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors bg-white/50 dark:bg-gray-900/50 backdrop-blur rounded-full"
          aria-label="Skip walkthrough"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content Area */}
        <div className="relative h-80 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className={`absolute inset-0 flex flex-col items-center justify-center p-8 text-center ${steps[currentStep].color}`}
            >
              {steps[currentStep].icon}
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                {steps[currentStep].title}
              </h2>
              <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed max-w-sm mx-auto">
                {steps[currentStep].description}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Controls */}
        <div className="p-6 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between">
            {/* Dots */}
            <div className="flex space-x-2">
              {steps.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    idx === currentStep
                      ? 'w-6 bg-indigo-600 dark:bg-indigo-400'
                      : 'w-2 bg-gray-200 dark:bg-gray-800'
                  }`}
                />
              ))}
            </div>

            {/* Next/Finish Button */}
            <button
              onClick={nextStep}
              className="flex items-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-md active:scale-95 transition-all"
            >
              {isLastStep ? (
                <>
                  Get Started
                  <Check className="w-5 h-5 ml-2" />
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="w-5 h-5 ml-2" />
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
