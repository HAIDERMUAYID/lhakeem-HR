'use client';

import { motion } from 'framer-motion';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 md:p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-2xl w-full"
      >
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary-700 mb-4">
          نظام إدارة الإجازات والدوام
        </h1>
        <p className="text-lg sm:text-xl text-gray-600 mb-8">
          مستشفى الحكيم
        </p>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <a
            href="/login"
            className="inline-flex items-center justify-center px-8 py-4 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-700 transition-colors min-h-touch touch-manipulation"
          >
            تسجيل الدخول
          </a>
        </motion.div>
        <p className="mt-8 text-sm text-gray-500">
          واجهة إدارية احترافية • متوافق مع جميع الأجهزة
        </p>
      </motion.div>
    </main>
  );
}
