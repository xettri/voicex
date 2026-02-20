'use client';

import Link from 'next/link';

export default function PendingPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ colorScheme: 'light' }}>
      <div className="h-14 bg-white border-b border-gray-200 flex items-center px-6">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1a4 4 0 014 4v6a4 4 0 01-8 0V5a4 4 0 014-4zm0 16a8 8 0 008-8 1 1 0 012 0 10 10 0 01-9 9.95V21h2a1 1 0 010 2H9a1 1 0 010-2h2v-2.05A10 10 0 012 9a1 1 0 012 0 8 8 0 008 8z" />
            </svg>
          </div>
          <span className="text-base font-bold text-gray-900 tracking-tight">VoiceX</span>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          {/* Icon */}
          <div className="w-20 h-20 bg-amber-50 border-2 border-amber-200 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-9 h-9 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">Account Pending Verification</h1>
          <p className="text-gray-500 text-sm leading-relaxed mb-8">
            Thanks for signing up! Your account has been created and is currently under review.
            <br className="hidden sm:block" />
            You&apos;ll receive an email once your account is approved.
          </p>

          {/* Steps */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-left mb-6">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">What happens next</div>
            <div className="space-y-4">
              {[
                {
                  icon: '✓',
                  color: 'bg-green-100 text-green-600',
                  title: 'Account created',
                  desc: 'Your account and organization have been set up.',
                  done: true,
                },
                {
                  icon: '2',
                  color: 'bg-amber-100 text-amber-600',
                  title: 'Manual verification',
                  desc: 'Our team reviews new signups before granting access.',
                  done: false,
                },
                {
                  icon: '3',
                  color: 'bg-gray-100 text-gray-400',
                  title: 'Access granted',
                  desc: "Once approved, sign in and you'll have full dashboard access.",
                  done: false,
                },
              ].map((step) => (
                <div key={step.title} className="flex gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${step.color}`}>
                    {step.icon}
                  </div>
                  <div>
                    <div className={`text-sm font-medium ${step.done ? 'text-gray-900' : 'text-gray-500'}`}>
                      {step.title}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Link
              href="/login"
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors text-center"
            >
              Back to Sign In
            </Link>
            <p className="text-xs text-gray-400">
              Questions?{' '}
              <a href="mailto:support@voicex.ai" className="text-blue-600 hover:underline">
                Contact support
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
