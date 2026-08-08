import React, { Suspense } from 'react'
import { GalleryContent } from './_components/GalleryContent';

export default function GalleryPage() {
  return (
    <Suspense fallback={<GalleryLoading />}>
      <GalleryContent />
    </Suspense>
  )
}


function GalleryLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      Loading gallery...
    </div>
  );
}