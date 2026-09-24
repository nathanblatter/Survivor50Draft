export interface SeasonSeed {
  show: { name: string; slug: string; description?: string };
  season: { number: number; name?: string; premiere_date?: string };
  tribes: { name: string; color: string }[];
  players: {
    name: string;
    nickname?: string;
    original_seasons?: string;
    tribe: string;
    photo_url?: string;
    occupation?: string;
    hometown?: string;
  }[];
  /** Created only if the show has no scoring rules yet. */
  scoringRules?: { eventType: string; points: number; description: string; isVariable?: boolean }[];
  /** Default league created if it doesn't exist yet. */
  league?: { name: string; invite_code: string };
}

/** The Survivor scoring rules used since Survivor 50. */
export const SURVIVOR_RULES: NonNullable<SeasonSeed['scoringRules']> = [
  { eventType: 'placement', points: 0, description: 'Place in the game (pts = cast size + 1 - placement)', isVariable: true },
  { eventType: 'makes_merge', points: 3, description: 'Makes the merge' },
  { eventType: 'makes_jury', points: 5, description: 'Makes the jury' },
  { eventType: 'makes_ftc', points: 7, description: 'Makes Final Tribal Council' },
  { eventType: 'votes_for_winner', points: 1, description: 'Votes for the winner' },
  { eventType: 'finds_idol', points: 2, description: 'Finding an idol' },
  { eventType: 'finds_advantage', points: 1, description: 'Finding an advantage' },
  { eventType: 'idol_advantage_play', points: 1, description: 'Idol/Advantage play' },
  { eventType: 'receives_votes', points: -0.25, description: 'Receiving votes (per vote)' },
  { eventType: 'in_on_vote', points: 1, description: 'In on the vote' },
  { eventType: 'vote_out_with_idol', points: 3, description: 'Part of voting out somebody with an idol' },
  { eventType: 'voted_out_with_idol', points: -5, description: 'Getting voted out with an idol' },
  { eventType: 'tribe_wins_immunity', points: 1, description: 'On a tribe that wins immunity' },
  { eventType: 'tribe_wins_reward', points: 0.5, description: 'On a tribe that wins reward' },
  { eventType: 'wins_individual_reward', points: 2, description: 'Wins individual reward' },
  { eventType: 'chosen_for_reward', points: 0.5, description: 'Gets chosen to go on a reward' },
  { eventType: 'wins_individual_immunity', points: 3, description: 'Wins individual immunity' },
  { eventType: 'goes_on_journey', points: 0.5, description: 'Goes on a "journey"' },
  { eventType: 'idol_misplay', points: -2, description: 'Player misplays their idol' },
  { eventType: 'correct_idol_play', points: 3, description: 'Player uses idol correctly' },
  { eventType: 'voted_out_with_advantage', points: -2, description: 'Voted out holding a non-idol advantage' },
  { eventType: 'Win_The_Game', points: 25, description: 'Wins the game (majority of jury votes)' },
  { eventType: 'Voting_against_yourself', points: -1.5, description: 'Voting against yourself' },
  { eventType: 'Win_fire', points: 2, description: 'Wins the fire-making challenge' },
  { eventType: 'Lose_fire', points: -1, description: 'Loses the fire-making challenge' },
  { eventType: 'get_taken_to_f3', points: 1, description: 'Taken to the final 3 by the final immunity winner' },
  // Open Era additions (2026-09-23)
  { eventType: 'coin_flip_correct', points: 5, description: 'Calls the coin flip correctly (safe, wins an idol, doubles the pot)' },
  { eventType: 'coin_flip_wrong', points: -3, description: 'Calls the coin flip wrong and leaves the game' },
  { eventType: 'shot_in_the_dark_played', points: -0.5, description: 'Plays their Shot in the Dark' },
  { eventType: 'shot_in_the_dark_hits', points: 5, description: 'Shot in the Dark lands (safe)' },
  { eventType: 'fails_journey_task', points: -0.5, description: 'Fails a journey / exile task or gamble' },
  { eventType: 'votes_with_minority', points: -0.5, description: 'Votes for someone other than the person voted out' },
  { eventType: 'survives_rocks', points: 2, description: 'Survives a rock draw' },
  { eventType: 'drawn_out_by_rocks', points: -3, description: 'Drawn out of the game by rocks' },
  { eventType: 'jury_vote_received', points: 1, description: 'Receives a jury vote at Final Tribal Council (per vote)' },
  { eventType: 'provides_food', points: 0.5, description: 'Provides food for the tribe (fish, fruit, a catch)' },
  { eventType: 'quits_or_medevac', points: -2, description: 'Quits or is medically evacuated' },
];
