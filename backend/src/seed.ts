import pool, { initDB } from './db';
import dotenv from 'dotenv';

dotenv.config();

const castMembers = [
  // Cila Tribe (Orange)
  { name: "Joe Hunter", nickname: null, originalSeasons: "47", tribe: "Cila", photoUrl: "/cast-photos/joe-hunter.webp" },
  { name: "Savannah Louie", nickname: null, originalSeasons: "49", tribe: "Cila", photoUrl: "/cast-photos/savannah-louie.webp" },
  { name: "Christian Hubicki", nickname: null, originalSeasons: "37", tribe: "Cila", photoUrl: "/cast-photos/christian-hubicki.webp" },
  { name: "Cirie Fields", nickname: null, originalSeasons: "12, 16, 20, 34", tribe: "Cila", photoUrl: "/cast-photos/cirie-fields.webp" },
  { name: "Ozzy Lusth", nickname: null, originalSeasons: "13, 16, 23, 34", tribe: "Cila", photoUrl: "/cast-photos/ozzy-lusth.webp" },
  { name: "Emily Flippen", nickname: null, originalSeasons: "45", tribe: "Cila", photoUrl: "/cast-photos/emily-flippen.webp" },
  { name: "Rick Devens", nickname: null, originalSeasons: "38", tribe: "Cila", photoUrl: "/cast-photos/rick-devens.webp" },
  { name: "Jenna Lewis-Dougherty", nickname: "Jenna L.", originalSeasons: "1, 8", tribe: "Cila", photoUrl: "/cast-photos/jenna-lewis-dougherty.webp" },

  // Kalo Tribe (Teal)
  { name: "Jonathan Young", nickname: null, originalSeasons: "42", tribe: "Kalo", photoUrl: "/cast-photos/jonathan-young.webp" },
  { name: "Dee Valladares", nickname: null, originalSeasons: "45", tribe: "Kalo", photoUrl: "/cast-photos/dee-valladares.webp" },
  { name: "Mike White", nickname: null, originalSeasons: "37", tribe: "Kalo", photoUrl: "/cast-photos/mike-white.webp" },
  { name: "Kamilla Karthigesu", nickname: null, originalSeasons: "46", tribe: "Kalo", photoUrl: "/cast-photos/kamilla-karthigesu.webp" },
  { name: "Charlie Davis", nickname: null, originalSeasons: "46", tribe: "Kalo", photoUrl: "/cast-photos/charlie-davis.webp" },
  { name: "Tiffany Nicole Ervin", nickname: "Tiffany", originalSeasons: "47", tribe: "Kalo", photoUrl: "/cast-photos/tiffany-nicole-ervin.webp" },
  { name: "Benjamin Wade", nickname: "Coach", originalSeasons: "18, 20, 23", tribe: "Kalo", photoUrl: "/cast-photos/benjamin-wade.webp" },
  { name: "Chrissy Hofbeck", nickname: null, originalSeasons: "35", tribe: "Kalo", photoUrl: "/cast-photos/chrissy-hofbeck.webp" },

  // Vatu Tribe (Purple/Pink)
  { name: "Colby Donaldson", nickname: null, originalSeasons: "2, 8, 20", tribe: "Vatu", photoUrl: "/cast-photos/colby-donaldson.webp" },
  { name: "Genevieve Mushaluk", nickname: null, originalSeasons: "47", tribe: "Vatu", photoUrl: "/cast-photos/genevieve-mushaluk.webp" },
  { name: "Rizo Velovic", nickname: null, originalSeasons: "49", tribe: "Vatu", photoUrl: "/cast-photos/rizo-velovic.webp" },
  { name: "Angelina Keeley", nickname: null, originalSeasons: "37", tribe: "Vatu", photoUrl: "/cast-photos/angelina-keeley.webp" },
  { name: "Q Burdette", nickname: null, originalSeasons: "46", tribe: "Vatu", photoUrl: "/cast-photos/q-burdette.webp" },
  { name: "Stephenie LaGrossa Kendrick", nickname: "Stephenie", originalSeasons: "10, 11, 20", tribe: "Vatu", photoUrl: "/cast-photos/stephenie-lagrossa-kendrick.webp" },
  { name: "Kyle Fraser", nickname: null, originalSeasons: "48", tribe: "Vatu", photoUrl: "/cast-photos/kyle-fraser.webp" },
  { name: "Aubry Bracco", nickname: null, originalSeasons: "32, 34, 38", tribe: "Vatu", photoUrl: "/cast-photos/aubry-bracco.webp" },
];

const scoringRules = [
  { eventType: "placement", points: 0, description: "Place in the game (pts = cast_count + 1 - placement)", isVariable: true },
  { eventType: "makes_merge", points: 3, description: "Makes the merge" },
  { eventType: "makes_jury", points: 5, description: "Makes the jury" },
  { eventType: "makes_ftc", points: 7, description: "Makes Final Tribal Council" },
  { eventType: "votes_for_winner", points: 1, description: "Votes for the winner" },
  { eventType: "finds_idol", points: 2, description: "Finding an idol" },
  { eventType: "finds_advantage", points: 1, description: "Finding an advantage" },
  { eventType: "idol_advantage_play", points: 1, description: "Idol/Advantage play" },
  { eventType: "receives_votes", points: -0.25, description: "Receiving votes (per vote)" },
  { eventType: "in_on_vote", points: 1, description: "In on the vote" },
  { eventType: "vote_out_with_idol", points: 3, description: "Part of voting out somebody with an idol" },
  { eventType: "voted_out_with_idol", points: -5, description: "Getting voted out with an idol" },
  { eventType: "tribe_wins_immunity", points: 1, description: "On a tribe that wins immunity" },
  { eventType: "tribe_wins_reward", points: 0.5, description: "On a tribe that wins reward" },
  { eventType: "wins_individual_reward", points: 2, description: "Wins individual reward" },
  { eventType: "chosen_for_reward", points: 0.5, description: "Gets chosen to go on a reward" },
  { eventType: "wins_individual_immunity", points: 3, description: "Wins individual immunity" },
  { eventType: "goes_on_journey", points: 0.5, description: 'Goes on a "journey"' },
];

async function seed() {
  await initDB();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create show
    const showResult = await client.query(
      `INSERT INTO shows (name, slug, description)
       VALUES ('Survivor', 'survivor', 'The original reality competition')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    const showId = showResult.rows[0].id;

    // Create season
    const seasonResult = await client.query(
      `INSERT INTO seasons (show_id, season_number, name, cast_count, is_active)
       VALUES ($1, 50, 'In the Hands of the Fans', $2, true)
       ON CONFLICT (show_id, season_number) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [showId, castMembers.length]
    );
    const seasonId = seasonResult.rows[0].id;

    // Create default league
    const leagueResult = await client.query(
      `INSERT INTO leagues (season_id, name, invite_code)
       VALUES ($1, 'Original League', 'og-league')
       ON CONFLICT (invite_code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [seasonId]
    );
    const leagueId = leagueResult.rows[0].id;

    // Clear existing data (in dependency order)
    await client.query('DELETE FROM alliance_members');
    await client.query('DELETE FROM alliances WHERE season_id = $1', [seasonId]);
    await client.query('DELETE FROM game_advantages WHERE season_id = $1', [seasonId]);
    await client.query('DELETE FROM game_idols WHERE season_id = $1', [seasonId]);
    await client.query('DELETE FROM tribe_history');
    await client.query('DELETE FROM scoring_events');
    await client.query('DELETE FROM team_players');
    await client.query('DELETE FROM draft_state WHERE league_id = $1', [leagueId]);
    await client.query('DELETE FROM teams WHERE league_id = $1', [leagueId]);
    await client.query('DELETE FROM scoring_rules WHERE show_id = $1', [showId]);
    await client.query('DELETE FROM tribes WHERE season_id = $1', [seasonId]);
    await client.query('DELETE FROM players WHERE season_id = $1', [seasonId]);

    // Insert players
    for (const player of castMembers) {
      await client.query(
        'INSERT INTO players (season_id, name, nickname, original_seasons, tribe, photo_url) VALUES ($1, $2, $3, $4, $5, $6)',
        [seasonId, player.name, player.nickname, player.originalSeasons, player.tribe, player.photoUrl]
      );
    }
    console.log(`Inserted ${castMembers.length} players`);

    // Insert scoring rules
    for (const rule of scoringRules) {
      await client.query(
        'INSERT INTO scoring_rules (show_id, event_type, points, description, is_variable) VALUES ($1, $2, $3, $4, $5)',
        [showId, rule.eventType, rule.points, rule.description, rule.isVariable || false]
      );
    }
    console.log(`Inserted ${scoringRules.length} scoring rules`);

    // Insert original tribes
    const originalTribes = [
      { name: 'Cila', color: '#E87830' },
      { name: 'Kalo', color: '#4AC8D9' },
      { name: 'Vatu', color: '#D06CC0' },
    ];
    const tribeIdMap: Record<string, number> = {};
    for (const tribe of originalTribes) {
      const result = await client.query(
        'INSERT INTO tribes (season_id, name, color, phase, introduced_episode) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [seasonId, tribe.name, tribe.color, 'original', 1]
      );
      tribeIdMap[tribe.name] = result.rows[0].id;
    }
    console.log('Inserted 3 original tribes');

    // Insert tribe history for each player
    const allPlayers = await client.query('SELECT id, tribe FROM players WHERE season_id = $1', [seasonId]);
    for (const p of allPlayers.rows) {
      await client.query(
        'INSERT INTO tribe_history (player_id, tribe_id, phase, episode) VALUES ($1, $2, $3, $4)',
        [p.id, tribeIdMap[p.tribe], 'original', 1]
      );
    }
    console.log('Inserted tribe history for all players');

    // Initialize draft state for the default league
    await client.query(
      'INSERT INTO draft_state (league_id, is_active, is_complete, current_pick) VALUES ($1, false, false, 1)',
      [leagueId]
    );

    await client.query('COMMIT');
    console.log('Seed complete!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
