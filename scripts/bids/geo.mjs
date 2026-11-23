// Country-name normalisation and continent grouping (simplified UN geoscheme; Middle East and Caucasus/Central Asia are listed under Asia).
export const ALIAS = { '대한민국': 'South Korea', 'Korea, Republic of': 'South Korea', 'Republic of Korea': 'South Korea', 'Korea': 'South Korea', 'Bosnia And Herzegovina': 'Bosnia and Herzegovina', 'Central Africa': 'Central African Republic', 'Congo, Dem. Republic': 'Congo (DRC)', 'Congo, Democratic Republic of': 'Congo (DRC)', 'Congo, The Democratic Republic of the': 'Congo (DRC)', "Cote D'Ivoire": "Côte d'Ivoire", GIN: 'Guinea', 'Gambia, The': 'Gambia', 'Kosovo, Unscr 1244 (1999)': 'Kosovo', 'Kyrgyz Republic': 'Kyrgyzstan', "Lao People's Democratic Republic": 'Laos', 'Moldova, Republic of': 'Moldova', 'Palestine, State of': 'Palestine', 'Palestinian Territories': 'Palestine', 'Republic Of North Macedonia': 'North Macedonia', 'Sao Tome And Principe': 'São Tomé and Príncipe', 'Serbia, Republic of': 'Serbia', Swaziland: 'Eswatini', 'Syrian Arab Republic': 'Syria', 'Trinidad And Tobago': 'Trinidad and Tobago', Türkiye: 'Turkey', 'Viet Nam': 'Vietnam', Congo: 'Congo (Republic)', 'Multiple destinations': '', 'Eastern and Southern Africa': '' };
const L = (k, arr) => arr.map(c => [c, k]);
export const CONT = Object.fromEntries([
  ...L('europe', ['Albania', 'Austria', 'Belgium', 'Bosnia and Herzegovina', 'Bulgaria', 'Croatia', 'Cyprus', 'Czechia', 'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Iceland', 'Ireland', 'Italy', 'Kosovo', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta', 'Moldova', 'Montenegro', 'Netherlands', 'North Macedonia', 'Norway', 'Poland', 'Portugal', 'Romania', 'Serbia', 'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland', 'Ukraine', 'United Kingdom']),
  ...L('asia', ['Afghanistan', 'Armenia', 'Bahrain', 'Bangladesh', 'Cambodia', 'China', 'Georgia', 'India', 'Indonesia', 'Iran', 'Iraq', 'Japan', 'Jordan', 'Kazakhstan', 'Kyrgyzstan', 'Laos', 'Lebanon', 'Malaysia', 'Maldives', 'Mongolia', 'Myanmar', 'Nepal', 'Pakistan', 'Palestine', 'Philippines', 'Qatar', 'South Korea', 'Saudi Arabia', 'Sri Lanka', 'Syria', 'Tajikistan', 'Thailand', 'Timor-Leste', 'Turkey', 'Turkmenistan', 'Uzbekistan', 'Vietnam', 'Yemen']),
  ...L('africa', ['Algeria', 'Angola', 'Botswana', 'Burkina Faso', 'Burundi', 'Cameroon', 'Cape Verde', 'Central African Republic', 'Chad', 'Comoros', 'Congo (DRC)', 'Congo (Republic)', "Côte d'Ivoire", 'Djibouti', 'Egypt', 'Equatorial Guinea', 'Eswatini', 'Ethiopia', 'Gabon', 'Gambia', 'Ghana', 'Guinea', 'Kenya', 'Lesotho', 'Liberia', 'Libya', 'Madagascar', 'Malawi', 'Mali', 'Mauritania', 'Morocco', 'Mozambique', 'Niger', 'Nigeria', 'Rwanda', 'São Tomé and Príncipe', 'Senegal', 'Seychelles', 'Sierra Leone', 'Somalia', 'South Africa', 'South Sudan', 'Sudan', 'Tanzania', 'Togo', 'Tunisia', 'Uganda', 'Zambia', 'Zimbabwe']),
  ...L('namerica', ['Bahamas', 'Barbados', 'Canada', 'Costa Rica', 'Cuba', 'Dominica', 'Dominican Republic', 'El Salvador', 'Guatemala', 'Haiti', 'Honduras', 'Jamaica', 'Mexico', 'Panama', 'Trinidad and Tobago']),
  ...L('samerica', ['Argentina', 'Bolivia', 'Brazil', 'Chile', 'Colombia', 'Ecuador', 'Paraguay', 'Peru', 'Uruguay', 'Venezuela']),
  ...L('oceania', ['Cook Islands', 'Kiribati', 'Papua New Guinea', 'Samoa', 'Solomon Islands', 'Tonga', 'Vanuatu']),
]);
export const CONTS = [
  { k: 'europe', c: '#3f64a3', ko: '유럽', en: 'Europe', icon: 'public' },
  { k: 'asia', c: '#b4781f', ko: '아시아·중동', en: 'Asia & Middle East', icon: 'public' },
  { k: 'africa', c: '#4c7f4f', ko: '아프리카', en: 'Africa', icon: 'public' },
  { k: 'namerica', c: '#7b4f8c', ko: '북중미·카리브', en: 'North & Central America', icon: 'public' },
  { k: 'samerica', c: '#23808a', ko: '남미', en: 'South America', icon: 'public' },
  { k: 'oceania', c: '#bb5577', ko: '오세아니아', en: 'Oceania', icon: 'public' },
];
export const canon = n => { const v = String(n || '').trim(); return v in ALIAS ? ALIAS[v] : v; };
