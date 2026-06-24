let cachedFoods = null;
let loadingPromise = null;

export const THAI_FOOD_DATASET_COUNT = 1375;

export async function loadThaiPreparedFoods() {
  if (cachedFoods) return cachedFoods;
  loadingPromise ||= fetch('/data/thai-prepared-foods.json', { cache: 'force-cache' })
    .then(response => {
      if (!response.ok) throw new Error(`โหลดฐานอาหารไทยไม่สำเร็จ (${response.status})`);
      return response.json();
    })
    .then(rows => {
      cachedFoods = Array.isArray(rows) ? rows : [];
      return cachedFoods;
    })
    .catch(error => {
      loadingPromise = null;
      throw error;
    });
  return loadingPromise;
}

export function peekThaiPreparedFoods() {
  return cachedFoods || [];
}
