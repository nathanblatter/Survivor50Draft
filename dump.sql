--
-- PostgreSQL database dump
--

\restrict aHYwlQ7TcPcGeyYEOLBB6JgunJrBlgoF2jeImi5ezof3NjaBt0lArDbbCUyg5b0

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: draft_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.draft_state (
    id integer NOT NULL,
    is_active boolean DEFAULT false,
    is_complete boolean DEFAULT false,
    current_pick integer DEFAULT 1,
    snake_draft boolean DEFAULT true,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: draft_state_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.draft_state_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: draft_state_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.draft_state_id_seq OWNED BY public.draft_state.id;


--
-- Name: players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.players (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    nickname character varying(50),
    original_seasons character varying(200) NOT NULL,
    tribe character varying(50) NOT NULL,
    photo_url text,
    is_eliminated boolean DEFAULT false,
    placement integer,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: players_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.players_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: players_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.players_id_seq OWNED BY public.players.id;


--
-- Name: scoring_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scoring_events (
    id integer NOT NULL,
    player_id integer,
    event_type character varying(100) NOT NULL,
    points numeric(10,2) NOT NULL,
    episode integer,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: scoring_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scoring_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scoring_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scoring_events_id_seq OWNED BY public.scoring_events.id;


--
-- Name: scoring_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scoring_rules (
    id integer NOT NULL,
    event_type character varying(100) NOT NULL,
    points numeric(10,2) NOT NULL,
    description text NOT NULL,
    is_variable boolean DEFAULT false
);


--
-- Name: scoring_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scoring_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scoring_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scoring_rules_id_seq OWNED BY public.scoring_rules.id;


--
-- Name: team_players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_players (
    id integer NOT NULL,
    team_id integer,
    player_id integer,
    pick_number integer,
    drafted_at timestamp without time zone DEFAULT now()
);


--
-- Name: team_players_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.team_players_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: team_players_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.team_players_id_seq OWNED BY public.team_players.id;


--
-- Name: teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teams (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    owner_name character varying(100) NOT NULL,
    draft_order integer,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: teams_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.teams_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: teams_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.teams_id_seq OWNED BY public.teams.id;


--
-- Name: tribe_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tribe_history (
    id integer NOT NULL,
    player_id integer,
    tribe_name character varying(50) NOT NULL,
    phase character varying(20) NOT NULL,
    episode integer,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: tribe_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tribe_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tribe_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tribe_history_id_seq OWNED BY public.tribe_history.id;


--
-- Name: tribes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tribes (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    color character varying(7) NOT NULL,
    phase character varying(20) DEFAULT 'original'::character varying NOT NULL,
    introduced_episode integer,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: tribes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tribes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tribes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tribes_id_seq OWNED BY public.tribes.id;


--
-- Name: draft_state id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_state ALTER COLUMN id SET DEFAULT nextval('public.draft_state_id_seq'::regclass);


--
-- Name: players id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.players ALTER COLUMN id SET DEFAULT nextval('public.players_id_seq'::regclass);


--
-- Name: scoring_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scoring_events ALTER COLUMN id SET DEFAULT nextval('public.scoring_events_id_seq'::regclass);


--
-- Name: scoring_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scoring_rules ALTER COLUMN id SET DEFAULT nextval('public.scoring_rules_id_seq'::regclass);


--
-- Name: team_players id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_players ALTER COLUMN id SET DEFAULT nextval('public.team_players_id_seq'::regclass);


--
-- Name: teams id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams ALTER COLUMN id SET DEFAULT nextval('public.teams_id_seq'::regclass);


--
-- Name: tribe_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tribe_history ALTER COLUMN id SET DEFAULT nextval('public.tribe_history_id_seq'::regclass);


--
-- Name: tribes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tribes ALTER COLUMN id SET DEFAULT nextval('public.tribes_id_seq'::regclass);


--
-- Data for Name: draft_state; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.draft_state (id, is_active, is_complete, current_pick, snake_draft, updated_at) FROM stdin;
1	f	t	25	t	2026-02-26 02:31:49.2397
\.


--
-- Data for Name: players; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.players (id, name, nickname, original_seasons, tribe, photo_url, is_eliminated, placement, created_at) FROM stdin;
1	Joe Hunter	\N	47	Cila	/cast-photos/joe-hunter.webp	f	\N	2026-02-26 00:57:48.392187
2	Savannah Louie	\N	49	Cila	/cast-photos/savannah-louie.webp	f	\N	2026-02-26 00:57:48.392187
3	Christian Hubicki	\N	37	Cila	/cast-photos/christian-hubicki.webp	f	\N	2026-02-26 00:57:48.392187
5	Ozzy Lusth	\N	13, 16, 23, 34	Cila	/cast-photos/ozzy-lusth.webp	f	\N	2026-02-26 00:57:48.392187
6	Emily Flippen	\N	45	Cila	/cast-photos/emily-flippen.webp	f	\N	2026-02-26 00:57:48.392187
7	Rick Devens	\N	38	Cila	/cast-photos/rick-devens.webp	f	\N	2026-02-26 00:57:48.392187
9	Jonathan Young	\N	42	Kalo	/cast-photos/jonathan-young.webp	f	\N	2026-02-26 00:57:48.392187
10	Dee Valladares	\N	45	Kalo	/cast-photos/dee-valladares.webp	f	\N	2026-02-26 00:57:48.392187
12	Kamilla Karthigesu	\N	46	Kalo	/cast-photos/kamilla-karthigesu.webp	f	\N	2026-02-26 00:57:48.392187
13	Charlie Davis	\N	46	Kalo	/cast-photos/charlie-davis.webp	f	\N	2026-02-26 00:57:48.392187
14	Tiffany Nicole Ervin	Tiffany	47	Kalo	/cast-photos/tiffany-nicole-ervin.webp	f	\N	2026-02-26 00:57:48.392187
15	Benjamin Wade	Coach	18, 20, 23	Kalo	/cast-photos/benjamin-wade.webp	f	\N	2026-02-26 00:57:48.392187
16	Chrissy Hofbeck	\N	35	Kalo	/cast-photos/chrissy-hofbeck.webp	f	\N	2026-02-26 00:57:48.392187
17	Colby Donaldson	\N	2, 8, 20	Vatu	/cast-photos/colby-donaldson.webp	f	\N	2026-02-26 00:57:48.392187
18	Genevieve Mushaluk	\N	47	Vatu	/cast-photos/genevieve-mushaluk.webp	f	\N	2026-02-26 00:57:48.392187
19	Rizo Velovic	\N	49	Vatu	/cast-photos/rizo-velovic.webp	f	\N	2026-02-26 00:57:48.392187
20	Angelina Keeley	\N	37	Vatu	/cast-photos/angelina-keeley.webp	f	\N	2026-02-26 00:57:48.392187
21	Q Burdette	\N	46	Vatu	/cast-photos/q-burdette.webp	f	\N	2026-02-26 00:57:48.392187
22	Stephenie LaGrossa Kendrick	Stephenie	10, 11, 20	Vatu	/cast-photos/stephenie-lagrossa-kendrick.webp	f	\N	2026-02-26 00:57:48.392187
24	Aubry Bracco	\N	32, 34, 38	Vatu	/cast-photos/aubry-bracco.webp	f	\N	2026-02-26 00:57:48.392187
8	Jenna Lewis-Dougherty	Jenna L.	1, 8	Cila	/cast-photos/jenna-lewis-dougherty.webp	t	24	2026-02-26 00:57:48.392187
23	Kyle Fraser	\N	48	Vatu	/cast-photos/kyle-fraser.webp	t	23	2026-02-26 00:57:48.392187
11	Mike White	\N	37	Kalo	/cast-photos/mike-white.webp	f	\N	2026-02-26 00:57:48.392187
4	Cirie Fields	\N	12, 16, 20, 34	Cila	/cast-photos/cirie-fields.webp	f	\N	2026-02-26 00:57:48.392187
\.


--
-- Data for Name: scoring_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.scoring_events (id, player_id, event_type, points, episode, notes, created_at) FROM stdin;
1	19	tribe_wins_reward	0.50	1	\N	2026-02-26 02:33:25.675868
2	22	tribe_wins_reward	0.50	1	\N	2026-02-26 02:33:25.677668
3	21	tribe_wins_reward	0.50	1	\N	2026-02-26 02:33:25.678683
4	17	tribe_wins_reward	0.50	1	\N	2026-02-26 02:33:25.679631
5	18	tribe_wins_reward	0.50	1	\N	2026-02-26 02:33:25.680585
6	23	tribe_wins_reward	0.50	1	\N	2026-02-26 02:33:25.681499
7	24	tribe_wins_reward	0.50	1	\N	2026-02-26 02:33:25.682797
8	20	tribe_wins_reward	0.50	1	\N	2026-02-26 02:33:25.683968
9	21	goes_on_journey	0.50	1	\N	2026-02-26 02:43:46.607263
10	15	goes_on_journey	0.50	1	\N	2026-02-26 02:43:46.611731
11	5	goes_on_journey	0.50	1	\N	2026-02-26 02:43:46.61319
12	15	wins_individual_reward	2.00	1	\N	2026-02-26 02:50:16.699705
13	5	finds_advantage	1.00	1	\N	2026-02-26 03:12:59.179995
14	15	tribe_wins_immunity	1.00	1	\N	2026-02-26 03:44:33.24415
15	10	tribe_wins_immunity	1.00	1	\N	2026-02-26 03:44:33.249048
16	16	tribe_wins_immunity	1.00	1	\N	2026-02-26 03:44:33.250436
17	13	tribe_wins_immunity	1.00	1	\N	2026-02-26 03:44:33.252166
18	9	tribe_wins_immunity	1.00	1	\N	2026-02-26 03:44:33.253487
19	12	tribe_wins_immunity	1.00	1	\N	2026-02-26 03:44:33.254747
20	11	tribe_wins_immunity	1.00	1	\N	2026-02-26 03:44:33.255754
21	14	tribe_wins_immunity	1.00	1	\N	2026-02-26 03:44:33.256787
22	22	tribe_wins_immunity	1.00	1	\N	2026-02-26 03:45:01.718617
23	19	tribe_wins_immunity	1.00	1	\N	2026-02-26 03:45:01.720708
24	21	tribe_wins_immunity	1.00	1	\N	2026-02-26 03:45:01.72245
25	17	tribe_wins_immunity	1.00	1	\N	2026-02-26 03:45:01.724407
26	18	tribe_wins_immunity	1.00	1	\N	2026-02-26 03:45:01.725633
27	23	tribe_wins_immunity	1.00	1	\N	2026-02-26 03:45:01.727989
28	24	tribe_wins_immunity	1.00	1	\N	2026-02-26 03:45:01.729203
29	20	tribe_wins_immunity	1.00	1	\N	2026-02-26 03:45:01.730247
30	4	receives_votes	-0.25	1	\N	2026-02-26 04:09:02.134166
31	8	receives_votes	-0.25	1	\N	2026-02-26 04:09:16.616902
32	8	receives_votes	-0.25	1	\N	2026-02-26 04:15:49.674188
33	8	receives_votes	-0.25	1	\N	2026-02-26 04:16:04.034072
34	8	receives_votes	-0.25	1	\N	2026-02-26 04:16:14.960277
35	8	receives_votes	-0.25	1	\N	2026-02-26 04:16:25.962484
36	8	receives_votes	-0.25	1	\N	2026-02-26 04:16:39.053795
37	8	receives_votes	-0.25	1	\N	2026-02-26 04:16:58.879033
38	3	in_on_vote	1.00	1	\N	2026-02-26 04:17:36.475432
39	4	in_on_vote	1.00	1	\N	2026-02-26 04:17:36.477488
40	6	in_on_vote	1.00	1	\N	2026-02-26 04:17:36.478566
41	1	in_on_vote	1.00	1	\N	2026-02-26 04:17:36.479967
42	5	in_on_vote	1.00	1	\N	2026-02-26 04:17:36.481121
43	7	in_on_vote	1.00	1	\N	2026-02-26 04:17:36.482299
44	2	in_on_vote	1.00	1	\N	2026-02-26 04:17:36.483753
45	18	finds_idol	2.00	1	\N	2026-02-26 04:24:15.574869
46	11	goes_on_journey	0.50	1	\N	2026-02-26 04:26:10.270703
47	2	goes_on_journey	0.50	1	\N	2026-02-26 04:26:10.273119
48	17	goes_on_journey	0.50	1	\N	2026-02-26 04:26:10.27425
49	2	finds_advantage	1.00	1	\N	2026-02-26 04:35:52.183668
50	8	placement	1.00	1	\N	2026-02-26 04:45:25.375947
51	23	placement	2.00	1	\N	2026-02-26 04:50:03.731455
\.


--
-- Data for Name: scoring_rules; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.scoring_rules (id, event_type, points, description, is_variable) FROM stdin;
1	placement	0.00	Place in the game (pts = 25 - placement)	t
2	makes_merge	3.00	Makes the merge	f
3	makes_jury	5.00	Makes the jury	f
4	makes_ftc	7.00	Makes Final Tribal Council	f
5	votes_for_winner	1.00	Votes for the winner	f
6	finds_idol	2.00	Finding an idol	f
7	finds_advantage	1.00	Finding an advantage	f
8	idol_advantage_play	1.00	Idol/Advantage play	f
9	receives_votes	-0.25	Receiving votes (per vote)	f
10	in_on_vote	1.00	In on the vote	f
11	vote_out_with_idol	3.00	Part of voting out somebody with an idol	f
12	voted_out_with_idol	-5.00	Getting voted out with an idol	f
13	tribe_wins_immunity	1.00	On a tribe that wins immunity	f
14	tribe_wins_reward	0.50	On a tribe that wins reward	f
15	wins_individual_reward	2.00	Wins individual reward	f
16	chosen_for_reward	0.50	Gets chosen to go on a reward	f
17	wins_individual_immunity	3.00	Wins individual immunity	f
18	goes_on_journey	0.50	Goes on a "journey"	f
\.


--
-- Data for Name: team_players; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.team_players (id, team_id, player_id, pick_number, drafted_at) FROM stdin;
1	2	4	1	2026-02-26 02:22:46.66177
2	3	1	2	2026-02-26 02:23:12.193357
3	6	8	3	2026-02-26 02:23:59.250248
4	1	18	4	2026-02-26 02:24:41.865358
5	4	21	5	2026-02-26 02:25:01.19798
6	5	22	6	2026-02-26 02:25:40.025812
7	5	19	7	2026-02-26 02:25:43.810695
8	4	23	8	2026-02-26 02:25:49.684852
9	1	16	9	2026-02-26 02:26:14.308001
10	6	10	10	2026-02-26 02:26:40.751409
11	3	17	11	2026-02-26 02:27:22.106631
12	2	12	12	2026-02-26 02:27:30.868928
13	2	3	13	2026-02-26 02:28:33.711437
14	3	15	14	2026-02-26 02:29:09.770986
15	6	11	15	2026-02-26 02:29:49.800636
16	1	7	16	2026-02-26 02:30:05.736839
17	4	5	17	2026-02-26 02:30:21.08075
18	5	24	18	2026-02-26 02:30:32.089916
19	5	9	19	2026-02-26 02:30:45.894834
20	4	14	20	2026-02-26 02:30:53.17064
21	1	20	21	2026-02-26 02:31:07.707154
22	6	13	22	2026-02-26 02:31:11.378745
23	3	2	23	2026-02-26 02:31:34.298887
24	2	6	24	2026-02-26 02:31:49.238591
\.


--
-- Data for Name: teams; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.teams (id, name, owner_name, draft_order, created_at) FROM stdin;
1	Retords	Parky	4	2026-02-26 01:59:48.83911
2	kkk	Kaylee	1	2026-02-26 02:00:11.329016
4	DEI Hires	Grant	5	2026-02-26 02:01:00.324001
5	Coach worshipper	Nathan	6	2026-02-26 02:02:30.40237
6	Maddie #1 Survivor Fan	Maddie	3	2026-02-26 02:02:52.153624
3	Pat's Perfect Performers	Pat, Peyton, Jaxon	2	2026-02-26 02:00:32.102037
\.


--
-- Data for Name: tribe_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tribe_history (id, player_id, tribe_name, phase, episode, created_at) FROM stdin;
1	1	Cila	original	1	2026-02-26 05:49:22.955523
2	2	Cila	original	1	2026-02-26 05:49:22.955523
3	3	Cila	original	1	2026-02-26 05:49:22.955523
4	4	Cila	original	1	2026-02-26 05:49:22.955523
5	5	Cila	original	1	2026-02-26 05:49:22.955523
6	6	Cila	original	1	2026-02-26 05:49:22.955523
7	7	Cila	original	1	2026-02-26 05:49:22.955523
8	9	Kalo	original	1	2026-02-26 05:49:22.955523
9	10	Kalo	original	1	2026-02-26 05:49:22.955523
10	12	Kalo	original	1	2026-02-26 05:49:22.955523
11	13	Kalo	original	1	2026-02-26 05:49:22.955523
12	14	Kalo	original	1	2026-02-26 05:49:22.955523
13	15	Kalo	original	1	2026-02-26 05:49:22.955523
14	16	Kalo	original	1	2026-02-26 05:49:22.955523
15	17	Vatu	original	1	2026-02-26 05:49:22.955523
16	18	Vatu	original	1	2026-02-26 05:49:22.955523
17	19	Vatu	original	1	2026-02-26 05:49:22.955523
18	20	Vatu	original	1	2026-02-26 05:49:22.955523
19	21	Vatu	original	1	2026-02-26 05:49:22.955523
20	22	Vatu	original	1	2026-02-26 05:49:22.955523
21	24	Vatu	original	1	2026-02-26 05:49:22.955523
22	8	Cila	original	1	2026-02-26 05:49:22.955523
23	23	Vatu	original	1	2026-02-26 05:49:22.955523
24	11	Kalo	original	1	2026-02-26 05:49:22.955523
\.


--
-- Data for Name: tribes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tribes (id, name, color, phase, introduced_episode, is_active, created_at) FROM stdin;
1	Cila	#E87830	original	1	t	2026-02-26 05:49:22.955523
2	Kalo	#4AC8D9	original	1	t	2026-02-26 05:49:22.955523
3	Vatu	#D06CC0	original	1	t	2026-02-26 05:49:22.955523
\.


--
-- Name: draft_state_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.draft_state_id_seq', 1, true);


--
-- Name: players_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.players_id_seq', 24, true);


--
-- Name: scoring_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.scoring_events_id_seq', 67, true);


--
-- Name: scoring_rules_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.scoring_rules_id_seq', 18, true);


--
-- Name: team_players_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.team_players_id_seq', 24, true);


--
-- Name: teams_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.teams_id_seq', 6, true);


--
-- Name: tribe_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tribe_history_id_seq', 24, true);


--
-- Name: tribes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tribes_id_seq', 3, true);


--
-- Name: draft_state draft_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_state
    ADD CONSTRAINT draft_state_pkey PRIMARY KEY (id);


--
-- Name: players players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_pkey PRIMARY KEY (id);


--
-- Name: scoring_events scoring_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scoring_events
    ADD CONSTRAINT scoring_events_pkey PRIMARY KEY (id);


--
-- Name: scoring_rules scoring_rules_event_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scoring_rules
    ADD CONSTRAINT scoring_rules_event_type_key UNIQUE (event_type);


--
-- Name: scoring_rules scoring_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scoring_rules
    ADD CONSTRAINT scoring_rules_pkey PRIMARY KEY (id);


--
-- Name: team_players team_players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_players
    ADD CONSTRAINT team_players_pkey PRIMARY KEY (id);


--
-- Name: team_players team_players_player_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_players
    ADD CONSTRAINT team_players_player_id_key UNIQUE (player_id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: tribe_history tribe_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tribe_history
    ADD CONSTRAINT tribe_history_pkey PRIMARY KEY (id);


--
-- Name: tribes tribes_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tribes
    ADD CONSTRAINT tribes_name_key UNIQUE (name);


--
-- Name: tribes tribes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tribes
    ADD CONSTRAINT tribes_pkey PRIMARY KEY (id);


--
-- Name: scoring_events scoring_events_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scoring_events
    ADD CONSTRAINT scoring_events_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: team_players team_players_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_players
    ADD CONSTRAINT team_players_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: team_players team_players_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_players
    ADD CONSTRAINT team_players_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: tribe_history tribe_history_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tribe_history
    ADD CONSTRAINT tribe_history_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict aHYwlQ7TcPcGeyYEOLBB6JgunJrBlgoF2jeImi5ezof3NjaBt0lArDbbCUyg5b0

