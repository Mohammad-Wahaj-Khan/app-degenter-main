"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Twitter, MessageCircle } from "lucide-react";
import LOGO from "@/public/degenterminalLogo.svg";

export default function MaintenancePage() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Maintenance page should always be visible
    setIsVisible(true);
  }, []);

  if (!isVisible) return null;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.3,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.8 },
    },
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center px-4 py-8 bg-black overflow-hidden">
      {/* Background Gradient */}
      <div
        className="absolute inset-0 z-0 h-60"
        style={{
          backgroundImage: `
          linear-gradient(
            120deg,
            #14624F 0%,
            #39C8A6 36.7%,
            #FA4E30 66.8%,
            #2D1B45 100%
          )
        `,
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
        }}
      >
        {/* Grain/Noise Overlay */}
        <div
          className="absolute inset-0 opacity-30 mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGZpbHRlciBpZD0ibm9pc2UiIHg9IjAlIiB5PSIwJSIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSI+PGZlVHVyYnVsZW5jZSB0eXBlPSJmcmFjdGFsTm9pc2UiIGJhc2VGcmVxdWVuY3k9IjAuOTgiIG51bU9jdGF2ZXM9IjUiIHN0aXRjaFRpbGVzPSJzdGl0Y2giLz48L2ZpbHRlcj48cmVjdCB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgZmlsdGVyPSJ1cmwoI25vaXNlKSIvPjwvc3ZnPg==")`,
            backgroundRepeat: "repeat",
            backgroundSize: "128px 128px",
          }}
        />

        {/* Fade overlay to blend bottom edge */}
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-b from-transparent to-black"></div>
      </div>

      {/* Content */}
      <motion.div
        className="relative z-10 flex flex-col items-center gap-8 max-w-2xl w-full"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Logo */}
        <motion.div
          className="mb-4"
          variants={itemVariants}
        >
          <motion.div
            animate={{
              y: [0, -10, 0],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <Image
              src={LOGO}
              alt="DEGEN Terminal"
              width={200}
              height={40}
              className="opacity-80"
              priority
            />
          </motion.div>
        </motion.div>

        {/* Machinery Icon */}
        <motion.div
          className="relative w-20 h-20 md:w-24 md:h-24"
          variants={itemVariants}
        >
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-degen-teal via-degen-orange to-degen-violet rounded-full opacity-20 blur-xl"
            animate={{
              boxShadow: [
                "0 0 20px rgba(16, 185, 129, 0.5)",
                "0 0 50px rgba(250, 78, 48, 0.6)",
                "0 0 20px rgba(16, 185, 129, 0.5)",
              ],
              scale: [1, 1.1, 1],
            }}
            transition={{ duration: 2.5, repeat: Infinity }}
          ></motion.div>
          <div className="relative w-full h-full flex items-center justify-center">
            <motion.div
              className="text-degen-orange w-16 h-16 md:w-20 md:h-20"
              animate={{ 
                rotate: 360,
                scale: [1, 1.05, 1],
              }}
              transition={{ 
                rotate: { duration: 5, repeat: Infinity, ease: "linear" },
                scale: { duration: 2, repeat: Infinity, ease: "easeInOut" }
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="100%"
                height="100%"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.72l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.72V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.72l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.72V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </motion.div>
          </div>
        </motion.div>

        {/* Loading Animation */}
        {/* <motion.div
          className="flex items-center gap-2 mt-8"
          variants={itemVariants}
        >
          <motion.div
            className="w-2 h-2 bg-gradient-to-r from-degen-orange to-degen-red rounded-full"
            animate={{
              y: [0, -10, 0],
              boxShadow: [
                "0 0 5px rgba(250, 78, 48, 0.3)",
                "0 0 15px rgba(250, 78, 48, 0.8)",
                "0 0 5px rgba(250, 78, 48, 0.3)",
              ],
            }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
          <motion.div
            className="w-2 h-2 bg-gradient-to-r from-degen-orange to-degen-red rounded-full"
            animate={{
              y: [0, -10, 0],
              boxShadow: [
                "0 0 5px rgba(250, 78, 48, 0.3)",
                "0 0 15px rgba(250, 78, 48, 0.8)",
                "0 0 5px rgba(250, 78, 48, 0.3)",
              ],
            }}
            transition={{ duration: 0.8, repeat: Infinity, delay: 0.1 }}
          />
          <motion.div
            className="w-2 h-2 bg-gradient-to-r from-degen-orange to-degen-red rounded-full"
            animate={{
              y: [0, -10, 0],
              boxShadow: [
                "0 0 5px rgba(250, 78, 48, 0.3)",
                "0 0 15px rgba(250, 78, 48, 0.8)",
                "0 0 5px rgba(250, 78, 48, 0.3)",
              ],
            }}
            transition={{ duration: 0.8, repeat: Infinity, delay: 0.2 }}
          />
        </motion.div> */}


        {/* Main Text */}
        <motion.div
          className="text-center space-y-4"
          variants={itemVariants}
        >
          <motion.h1
            className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-degen-teal via-degen-orange to-degen-violet bg-clip-text text-transparent"
            animate={{
              backgroundPosition: ["0%", "100%"],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              repeatType: "reverse",
            }}
          >
            Under Maintenance
          </motion.h1>

          <motion.p
            className="text-lg md:text-xl text-gray-300 leading-relaxed"
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            We're currently upgrading DEGENTERMINAL to bring you an even better experience. We'll be back online shortly.
          </motion.p>
        </motion.div>

     
        {/* Contact Section */}
        <motion.div
          className="w-full text-center space-y-3 mt-3"
          variants={itemVariants}
        >
          <p className="text-gray-400 text-sm md:text-base">
            For updates, follow us on social media or check back soon
          </p>

          <div className="flex justify-center gap-4 flex-wrap">
            <motion.a
              href="https://x.com/Degen_Ter"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-degen-orange/20 to-degen-orange/10 hover:from-degen-orange/40 hover:to-degen-orange/30 text-white transition-all text-sm md:text-base border border-degen-orange/50 flex items-center gap-2 group"
              whileHover={{
                scale: 1.08,
                boxShadow: "0 0 20px rgba(250, 78, 48, 0.4)",
              }}
              whileTap={{ scale: 0.95 }}
            >
              <motion.div
                animate={{ rotate: [0, 10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Twitter className="w-5 h-5 text-degen-orange group-hover:text-yellow-300 transition-colors" />
              </motion.div>
              <span>Twitter</span>
            </motion.a>
          </div>
        </motion.div>



        {/* Footer Text */}
        {/* <motion.div
          className="text-xs md:text-sm text-gray-500 text-center mt-8"
          variants={itemVariants}
        >
          <motion.p
            animate={{
              opacity: [0.5, 1, 0.5],
              textShadow: [
                "0 0 10px rgba(250, 78, 48, 0)",
                "0 0 20px rgba(250, 78, 48, 0.3)",
                "0 0 10px rgba(250, 78, 48, 0)",
              ],
            }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            Thank you for your patience
          </motion.p>
          <p>DEGEN Terminal © 2026</p>
        </motion.div> */}
      </motion.div>
    </div>
  );
}
