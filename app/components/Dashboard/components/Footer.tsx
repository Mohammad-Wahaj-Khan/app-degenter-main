'use client';

import Link from 'next/link';
import backpack from '../brands/backpack.svg';
import shutter from '../brands/shutter.svg';
import phantom from '../brands/phantom.svg';
import Image from 'next/image';
import iconFacebook from '../../../../assets/fb.svg'
import iconInstagram from '../../../../assets/insta.svg'
import iconLinkedIn from '../../../../assets/linkedin.svg'
import iconX from '../../../../assets/x.svg'
import { useState, useEffect } from 'react';

export default function Footer() {
  const [currentTabSlide, setCurrentTabSlide] = useState(0);

  const tabSlidesData = [
    {
      tabs: [
        { label: "API", separator: true },
        { label: "IFRAME", separator: true },

      ]
    },
    {
      tabs: [
        { label: "WEB SOCKET", separator: true },
        { label: "PRICE BOT", separator: false }
      ]
    }
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTabSlide((prev) => (prev + 1) % tabSlidesData.length);
    }, 3500); // Auto-advance every 3.5 seconds
    return () => clearInterval(timer);
  }, [tabSlidesData.length]);

  return (
    <footer className="w-full">
      {/* Glass card (rounded, teal vignettes) */}
      <div
        className="rounded-2xl border border-white/10 overflow-hidden"
        // style={{
        //   background:
        //     'radial-gradient(900px 480px at 10% 0%, ##012929, transparent),' +
        //     'radial-gradient(800px 420px at 95% 0%, rgba(10,60,56,0.20), transparent),' +
        //     '#071215',
        // }}
        style={{
          backgroundImage:
            'linear-gradient(130deg, #012929 0%,rgb(0, 0, 0) 40% )',
        }}
      
      
      >
        <div className="px-4 sm:px-6 lg:px-8 py-5">
          {/* Two equal halves with a vertical divider */}
          <div className="grid grid-cols-1 md:grid-cols-2 relative">
            {/* divider (md+) */}
            <div className="hidden md:block absolute left-1/2 top-0 -translate-x-1/2 h-full w-px bg-white/15" />

            {/* LEFT: centered stack */}
            <div className="md:pr-10 flex flex-col justify-around items-center text-center">
              <h3 className="text-white text-[13px] sm:text-[20px]  mb-4">
                Enrich your products with our data
              </h3>

              {/* Tabs Slider */}
              <div className="relative w-full max-w-lg mx-auto">
                <div className="overflow-hidden">
                  <div
                    className="flex transition-transform duration-500 ease-in-out"
                    style={{ transform: `translateX(-${currentTabSlide * 100}%)` }}
                  >
                    {tabSlidesData.map((slideData, slideIndex) => (
                      <div key={slideIndex} className="w-full flex-shrink-0">
                        <div className="flex items-center justify-center gap-8 text-[10.5px] sm:text-[15px] text-white/70">
                          {slideData.tabs.map((tab, tabIndex) => (
                            <div key={tabIndex} className="flex items-center">
                              <span className="tracking-[0.22em]">{tab.label}</span>
                              {tab.separator && <span className="h-5 w-px bg-white/15 ml-8" />}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tab Slide Indicators */}
                <div className="flex justify-center mt-3 gap-1">
                  {tabSlidesData.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentTabSlide(index)}
                      className={`h-1 rounded-full transition-all duration-300 ${
                        index === currentTabSlide ? 'bg-white w-4' : 'bg-white/30 w-2 hover:bg-white/50'
                      }`}
                      aria-label={`Go to feature set ${index + 1}`}
                    />
                  ))}
                </div>
              </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Link
                    href="https://docs.birdeye.so/docs/overview"
                    target="_blank"
                    className="relative inline-flex items-center justify-center px-6 py-3 text-white rounded-2xl font-semibold overflow-hidden ring-1 ring-white/10 transition-transform active:scale-[0.99] shadow-[0_12px_28px_-18px_rgba(0,0,0,0.7)] transition-all duration-500 ease-in-out group"
                             style={{
                                backgroundImage:
                                  'linear-gradient(130deg, rgba(0,0,0,0) 13%, rgba(84,213,136,0.5) 60%, #009597 99%)',
                              }}
                >
                    <span className="absolute inset-0 bg-white opacity-10 blur-sm animate-shine" />
                    <span className="relative z-10">Pricing & Details</span>
                </Link>
                <Link
                    href="https://docs.birdeye.so/docs/overview"
                    target="_blank"
                    className="relative inline-flex items-center justify-center px-6 py-3 text-white rounded-2xl font-semibold overflow-hidden ring-1 ring-white/10 transition-transform active:scale-[0.99] shadow-[0_12px_28px_-18px_rgba(0,0,0,0.7)] transition-all duration-500 ease-in-out group"
                             style={{
                                backgroundImage:
                                  'linear-gradient(130deg, rgba(0,0,0,0) 13%, rgba(84,213,136,0.5) 60%, #009597 99%)',
                              }}
                >
                    <span className="absolute inset-0 bg-white opacity-10 blur-sm animate-shine" />
                    <span className="relative z-10">Docs</span>
                </Link>
            </div>
            </div>

            <div className="md:pl-10 mt-6 md:mt-0 flex flex-col text-left md:text-center">
  <h3 className="text-white text-[18px] md:text-[20px] mt-4">Trusted by the best</h3>

  <div className="relative w-full overflow-hidden">
    {/* Adjust width to be more flexible */}
    <div className="flex gap-4 sm:gap-6 md:gap-8 lg:gap-10 w-full md:w-[160%] lg:w-[160%] pl-6 md:pl-20">
      {/* ROW A */}
      <div className="flex items-center justify-between gap-4 sm:gap-6 md:gap-8 w-full md:w-1/2 pl-6 md:pl-20">
        
        {/* side logo — taller */}
        <div className="w-1/3 md:w-auto">
          <Image
            src={shutter}
            alt="ZIGSCAN"
            className="w-full object-contain select-none"
            draggable={false}
          />
        </div>

        {/* center logo — largest */}
        <div className="w-1/3 md:w-auto">
          <Image
            src={backpack}
            alt="Memes.fun"
            className="w-full object-contain select-none"
            draggable={false}
          />
        </div>

        {/* side logo — taller */}
        <div className="w-1/3 md:w-auto">
          <Image
            src={phantom}
            alt="Oroswap"
            className="w-full object-contain select-none"
            draggable={false}
          />
        </div>
      </div>
    </div>
  </div>

  <style jsx>{`
    /* Track is 160% wide; move it from -60% ➜ 0% for a seamless left→right loop */
    @keyframes marquee-ltr {
      0%   { transform: translateX(-60%); }
      100% { transform: translateX(0%); }
    }
    .marquee-ltr {
      animation: marquee-ltr 16s linear infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      .marquee-ltr { animation: none; }
    }
  `}</style>
</div>



          </div>
        </div>
      </div>

      {/* Join our community — responsive layout */}
      <div className="my-8 sm:mt-10">
        <div className="max-w-[1000px] mx-auto flex justify-center items-center gap-6 md:gap-10">
          {/* Left: title */}
          <h4 className="text-white  text-[22px]  leading-none">
            Join our community
          </h4>

          {/* Right: icon row */}
          <div className="flex items-center gap-4 sm:gap-6">
            {[
              { href: 'https://facebook.com', alt: 'Facebook', src: iconFacebook },
              { href: 'https://instagram.com', alt: 'Instagram', src: iconInstagram },
              { href: 'https://x.com/Degen_Ter', alt: 'X', src: iconX },
              { href: 'https://linkedin.com', alt: 'LinkedIn', src: iconLinkedIn },
            ].map((s) => (
              <Link
                key={s.alt}
                href={s.href}
                target="_blank"
                aria-label={s.alt}
                className="relative flex items-center justify-center"
              >
                <span className="pointer-events-none absolute inset-0 rounded-[18px] bg-[radial-gradient(60%_60%_at_25%_20%,rgba(255,255,255,0.18),transparent)]" />
                <Image
                  src={s.src}
                  alt={s.alt}
                  className="w-10  h-auto object-contain select-none"
                  draggable={false}
                  priority={false}
                />
              </Link>
            ))}
          </div>
        </div>
      </div>


    </footer>
  );
}
