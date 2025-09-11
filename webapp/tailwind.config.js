// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",   // همه‌ی فایل‌های داخل src
    "./components/**/*.{js,ts,jsx,tsx,mdx}", // اگر کامپوننت خارج از src داری
  ],
  safelist: [
    // گرادیان‌های کارت‌های آیکونی (CoreCapabilities)
    "from-amber-300/95", "to-yellow-500/90",
    "from-sky-400/95",   "to-blue-600/90",
    "from-indigo-400/95","to-violet-600/90",
    "from-fuchsia-400/95","to-pink-600/90",
  ],
  theme: {
    extend: {
      // اگر توکن‌های رنگ/Radius برند داری، اینجا اضافه کن
    },
  },
  plugins: [
    // در صورت نیاز:
    // require("@tailwindcss/forms"),
    // require("@tailwindcss/typography"),
  ],
};
