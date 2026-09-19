import { SeasonSeed, SURVIVOR_RULES } from './types';

/**
 * Survivor 51 — "The Open Era". Premiered September 23, 2026. 21 castaways, two starting tribes.
 * Tribe names were not announced before the premiere, so they seed as their buff colors;
 * rename them from Admin → Cast → Tribes once revealed (players follow the rename).
 */
const seed: SeasonSeed = {
  show: { name: 'Survivor', slug: 'survivor', description: 'Outwit Outplay Outlast' },
  season: { number: 51, name: 'The Open Era', premiere_date: '2026-09-23' },
  tribes: [
    { name: 'Purple', color: '#9B59D0' },
    { name: 'Yellow', color: '#E8C547' },
  ],
  players: [
    // Purple buffs
    { name: 'Alexis Levine', tribe: 'Purple', occupation: 'Criminal defense attorney', hometown: 'Atlanta, GA', photo_url: '/cast-photos/s51-alexis-levine.jpg' },
    { name: 'Ana Sani', tribe: 'Purple', occupation: 'Voice actress', hometown: 'Toronto, ON', photo_url: '/cast-photos/s51-ana-sani.jpg' },
    { name: 'Carter Krull', tribe: 'Purple', occupation: 'Livestock farmer', hometown: 'Sioux Falls, SD', photo_url: '/cast-photos/s51-carter-krull.jpg' },
    { name: 'Cristian Chavez', tribe: 'Purple', occupation: 'Head of HR', hometown: 'Salt Lake City, UT', photo_url: '/cast-photos/s51-cristian-chavez.jpg' },
    { name: 'Eric Macksoud', tribe: 'Purple', occupation: 'Mental health counselor', hometown: 'Windsor Locks, CT', photo_url: '/cast-photos/s51-eric-macksoud.jpg' },
    { name: 'Kristin Flickinger', tribe: 'Purple', occupation: 'Crisis management', hometown: 'Santa Barbara, CA', photo_url: '/cast-photos/s51-kristin-flickinger.jpg' },
    { name: 'Linnea Capobianco', tribe: 'Purple', occupation: 'Entrepreneur', hometown: 'Jersey City, NJ', photo_url: '/cast-photos/s51-linnea-capobianco.jpg' },
    { name: 'Ori Jean-Charles', nickname: 'Ori', tribe: 'Purple', occupation: 'Personal trainer', hometown: 'Spring Valley, NY', photo_url: '/cast-photos/s51-ori-jean-charles.jpg' },
    { name: 'Rob Antonson', tribe: 'Purple', occupation: 'Airline gate agent', hometown: 'Cumberland, RI', photo_url: '/cast-photos/s51-rob-antonson.jpg' },
    { name: 'Sharonda Cox', tribe: 'Purple', occupation: 'Resident OBGYN', hometown: 'Richmond, KY', photo_url: '/cast-photos/s51-sharonda-cox.jpg' },
    // Yellow buffs
    { name: 'Aaliyah Puglia', tribe: 'Yellow', occupation: 'Chef', hometown: 'Providence, RI', photo_url: '/cast-photos/s51-aaliyah-puglia.jpg' },
    { name: 'Thien An Nguyen', nickname: 'An', tribe: 'Yellow', occupation: 'Medical student', hometown: 'Fort Worth, TX', photo_url: '/cast-photos/s51-thien-an-nguyen.jpg' },
    { name: 'Angelica Loblack', nickname: 'Jelly', tribe: 'Yellow', occupation: 'Sociology professor', hometown: 'Bloomington, IN', photo_url: '/cast-photos/s51-angelica-loblack.jpg' },
    { name: 'Brady Booker', tribe: 'Yellow', occupation: 'Pro wrestler', hometown: 'Knoxville, TN', photo_url: '/cast-photos/s51-brady-booker.jpg' },
    { name: 'Danny Kilby', nickname: 'Kilby', tribe: 'Yellow', occupation: 'Game designer', hometown: 'London, ON', photo_url: '/cast-photos/s51-danny-kilby.jpg' },
    { name: 'Devin Way', tribe: 'Yellow', occupation: 'Actor', hometown: 'Los Angeles, CA', photo_url: '/cast-photos/s51-devin-way.jpg' },
    { name: 'Jenna Doore', tribe: 'Yellow', occupation: 'Wedding photographer', hometown: 'Toledo, OH', photo_url: '/cast-photos/s51-jenna-doore.jpg' },
    { name: 'Lewis Kelly', tribe: 'Yellow', occupation: 'Farmer', hometown: 'Corozal, PR', photo_url: '/cast-photos/s51-lewis-kelly.jpg' },
    { name: 'Maggie Nestor', tribe: 'Yellow', occupation: 'Farmer', hometown: 'Charles Town, WV', photo_url: '/cast-photos/s51-maggie-nestor.jpg' },
    { name: 'Mike Pinsky', tribe: 'Yellow', occupation: 'Baseball executive', hometown: 'New York, NY', photo_url: '/cast-photos/s51-mike-pinsky.jpg' },
    { name: 'Patt Cannaday', tribe: 'Yellow', occupation: 'Federal prosecutor', hometown: 'Washington, DC', photo_url: '/cast-photos/s51-patt-cannaday.jpg' },
  ],
  scoringRules: SURVIVOR_RULES,
  league: { name: 'Original League', invite_code: 'og51' },
};

export default seed;
