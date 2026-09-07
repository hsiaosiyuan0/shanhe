export const browserMode = import.meta.env.MODE === 'pages';
export const assetUrl = (path: string) => import.meta.env.BASE_URL + path.replace(/^\//, '');
