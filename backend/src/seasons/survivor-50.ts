import { SeasonSeed, SURVIVOR_RULES } from './types';

const seed: SeasonSeed = {
  show: { name: 'Survivor', slug: 'survivor', description: 'Outwit Outplay Outlast' },
  season: { number: 50, name: 'In the Hands of the Fans', premiere_date: '2026-02-25' },
  tribes: [
    { name: 'Cila', color: '#E87830' },
    { name: 'Kalo', color: '#4AC8D9' },
    { name: 'Vatu', color: '#D06CC0' },
  ],
  players: [
    { name: 'Joe Hunter', original_seasons: '47', tribe: 'Cila', photo_url: '/cast-photos/joe-hunter.webp' },
    { name: 'Savannah Louie', original_seasons: '49', tribe: 'Cila', photo_url: '/cast-photos/savannah-louie.webp' },
    { name: 'Christian Hubicki', original_seasons: '37', tribe: 'Cila', photo_url: '/cast-photos/christian-hubicki.webp' },
    { name: 'Cirie Fields', original_seasons: '12, 16, 20, 34', tribe: 'Cila', photo_url: '/cast-photos/cirie-fields.webp' },
    { name: 'Ozzy Lusth', original_seasons: '13, 16, 23, 34', tribe: 'Cila', photo_url: '/cast-photos/ozzy-lusth.webp' },
    { name: 'Emily Flippen', original_seasons: '45', tribe: 'Cila', photo_url: '/cast-photos/emily-flippen.webp' },
    { name: 'Rick Devens', original_seasons: '38', tribe: 'Cila', photo_url: '/cast-photos/rick-devens.webp' },
    { name: 'Jenna Lewis-Dougherty', nickname: 'Jenna L.', original_seasons: '1, 8', tribe: 'Cila', photo_url: '/cast-photos/jenna-lewis-dougherty.webp' },
    { name: 'Jonathan Young', original_seasons: '42', tribe: 'Kalo', photo_url: '/cast-photos/jonathan-young.webp' },
    { name: 'Dee Valladares', original_seasons: '45', tribe: 'Kalo', photo_url: '/cast-photos/dee-valladares.webp' },
    { name: 'Mike White', original_seasons: '37', tribe: 'Kalo', photo_url: '/cast-photos/mike-white.webp' },
    { name: 'Kamilla Karthigesu', original_seasons: '46', tribe: 'Kalo', photo_url: '/cast-photos/kamilla-karthigesu.webp' },
    { name: 'Charlie Davis', original_seasons: '46', tribe: 'Kalo', photo_url: '/cast-photos/charlie-davis.webp' },
    { name: 'Tiffany Nicole Ervin', nickname: 'Tiffany', original_seasons: '47', tribe: 'Kalo', photo_url: '/cast-photos/tiffany-nicole-ervin.webp' },
    { name: 'Benjamin Wade', nickname: 'Coach', original_seasons: '18, 20, 23', tribe: 'Kalo', photo_url: '/cast-photos/benjamin-wade.webp' },
    { name: 'Chrissy Hofbeck', original_seasons: '35', tribe: 'Kalo', photo_url: '/cast-photos/chrissy-hofbeck.webp' },
    { name: 'Colby Donaldson', original_seasons: '2, 8, 20', tribe: 'Vatu', photo_url: '/cast-photos/colby-donaldson.webp' },
    { name: 'Genevieve Mushaluk', original_seasons: '47', tribe: 'Vatu', photo_url: '/cast-photos/genevieve-mushaluk.webp' },
    { name: 'Rizo Velovic', original_seasons: '49', tribe: 'Vatu', photo_url: '/cast-photos/rizo-velovic.webp' },
    { name: 'Angelina Keeley', original_seasons: '37', tribe: 'Vatu', photo_url: '/cast-photos/angelina-keeley.webp' },
    { name: 'Q Burdette', original_seasons: '46', tribe: 'Vatu', photo_url: '/cast-photos/q-burdette.webp' },
    { name: 'Stephenie LaGrossa Kendrick', nickname: 'Stephenie', original_seasons: '10, 11, 20', tribe: 'Vatu', photo_url: '/cast-photos/stephenie-lagrossa-kendrick.webp' },
    { name: 'Kyle Fraser', original_seasons: '48', tribe: 'Vatu', photo_url: '/cast-photos/kyle-fraser.webp' },
    { name: 'Aubry Bracco', original_seasons: '32, 34, 38', tribe: 'Vatu', photo_url: '/cast-photos/aubry-bracco.webp' },
  ],
  scoringRules: SURVIVOR_RULES,
  league: { name: 'Original League', invite_code: 'og-league' },
};

export default seed;
