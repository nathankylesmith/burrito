export const BURRITO_PHOTOS = [
  "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1562059390-a761a084768e?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1624300629298-e9de39c13be5?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1552332386-f8dd00dc2f85?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1599974579688-8dbdd335c77f?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1504544750208-dc0358e63f7f?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1613514785940-daed07799d9b?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1464219551459-ac14ae01fbe0?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1615870216519-2f9fa575fa5c?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1625167171750-419bf3cd0e15?auto=format&fit=crop&w=900&q=80",
];

export function photoForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return BURRITO_PHOTOS[hash % BURRITO_PHOTOS.length];
}
