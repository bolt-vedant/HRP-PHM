export interface ItemOption {
  name: string;
  levels?: { level: string; price: number }[];
  price?: number;
}

export interface Category {
  name: string;
  items: ItemOption[];
}

export const categories: Category[] = [
  {
    name: 'Performance',
    items: [
      {
        name: 'ENGINE UPGRADE',
        levels: [
          { level: 'Lv 1', price: 8000 },
          { level: 'Lv 2', price: 11100 },
          { level: 'Lv 3', price: 13000 },
          { level: 'Lv 4', price: 17500 },
          { level: 'Lv 5', price: 22000 },
        ],
      },
      {
        name: 'BRAKE UPGRADE',
        levels: [
          { level: 'Lv 1', price: 8500 },
          { level: 'Lv 2', price: 10500 },
          { level: 'Lv 3', price: 13000 },
          { level: 'Lv 4', price: 15500 },
          { level: 'Lv 5', price: 18000 },
        ],
      },
      {
        name: 'TRANSMISSION UPGRADE',
        levels: [
          { level: 'Lv 1', price: 8200 },
          { level: 'Lv 2', price: 10400 },
          { level: 'Lv 3', price: 12600 },
          { level: 'Lv 4', price: 16000 },
          { level: 'Lv 5', price: 19500 },
        ],
      },
      {
        name: 'SUSPENSION UPGRADE',
        levels: [
          { level: 'Lv 1', price: 8500 },
          { level: 'Lv 2', price: 10500 },
          { level: 'Lv 3', price: 13000 },
          { level: 'Lv 4', price: 15500 },
          { level: 'Lv 5', price: 18000 },
        ],
      },
      { name: 'TURBO UPGRADE', price: 15000 },
    ],
  },
  {
    name: 'Exterior Visuals',
    items: [
      { name: 'SPOILER', price: 1500 },
      { name: 'FRONT BUMPER', price: 1500 },
      { name: 'REAR BUMPER', price: 1500 },
      { name: 'SIDE SKIRT', price: 1500 },
      { name: 'EXHAUST', price: 1500 },
      { name: 'ROLL CAGE', price: 1500 },
      { name: 'GRILLE', price: 1500 },
      { name: 'HOOD', price: 1500 },
      { name: 'LEFT FENDER', price: 1500 },
      { name: 'ROOF', price: 1500 },
      { name: 'WHEELS', price: 1500 },
      { name: 'WHEELS SMOKE', price: 1500 },
      { name: 'CUSTOM WHEELS', price: 1500 },
      { name: 'LIVERY', price: 2000 },
      { name: 'RESPRAY', price: 800 },
      { name: 'WINDOW TINT', price: 1500 },
      { name: 'NEONS', price: 1500 },
      { name: 'XENONS', price: 1500 },
      { name: 'PLATE INDEX', price: 1000 },
      { name: 'VANITY PLATES', price: 1000 },
      { name: 'VEHICLE EXTRAS', price: 1000 },
    ],
  },
  {
    name: 'Interior / Misc',
    items: [
      { name: 'SEATS', price: 1500 },
      { name: 'STEERING WHEEL', price: 1000 },
      { name: 'ENGINE BLOCK', price: 1500 },
      { name: 'AIR FILTER', price: 1000 },
      { name: 'STRUT', price: 1500 },
      { name: 'ARCH COVER', price: 1500 },
      { name: 'AERIAL', price: 1500 },
      { name: 'TRIM A', price: 1500 },
      { name: 'TRIM B', price: 1500 },
      { name: 'TRUNK', price: 1500 },
      { name: 'FUEL TANK', price: 1500 },
      { name: 'WINDOW', price: 1500 },
      { name: 'HORNS', price: 1500 },
      { name: 'DASHBOARD', price: 1500 },
      { name: 'DIAL', price: 1500 },
      { name: 'DOOR SPEAKER', price: 1500 },
    ],
  },
];
