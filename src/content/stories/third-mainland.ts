import type { Story } from "./types";

export const thirdMainland: Story = {
  id: "third-mainland",
  title: "Third Mainland Hearts",
  tagline: "Two strangers, one danfo, and a city that refuses to slow down.",
  emoji: "🌆",
  palette: ["#f08a5d", "#6f63d9"],
  chapters: ["The Danfo", "Island Lights", "Before the Rain"],
  start: "start",
  nodes: {
    start: {
      chapter: 0,
      scene: "city-night",
      text: [
        "Obalende at six in the evening is a symphony nobody rehearsed. Conductors sing destinations, hawkers balance whole shops on their heads, and somewhere a generator coughs like an old uncle.",
        "{A} squeezes into the last danfo for Lekki. The only free seat is beside {B}, who is guarding a tall white box tied with ribbon as if it holds state secrets.",
        "The bus lurches. The box tilts. Time slows down the way it only does in films and in moments you'll retell for years.",
      ],
      choices: [
        { label: "Catch the box", to: "catch" },
        { label: "Make a joke about Lagos traffic", to: "joke" },
      ],
    },
    catch: {
      chapter: 0,
      scene: "city-night",
      text: [
        "{A} catches it with both hands — and one thumb lands straight in the frosting.",
        "{B} stares, then bursts out laughing. \"That's a red velvet you just fingerprinted,\" they say, offering a napkin and, after a pause, a puff-puff from a paper bag. \"Compensation.\"",
        "{B} is a baker, it turns out, heading to their very first pop-up stall on the Island. Their hands are a little shaky. Not from the bus.",
      ],
      choices: [
        { label: "Ask about the pop-up", to: "popup" },
        { label: "Offer to help carry the boxes", to: "carry" },
      ],
    },
    joke: {
      chapter: 0,
      scene: "bridge",
      text: [
        "\"At this speed,\" {A} says, \"we'll reach Lekki in time for our grandchildren's wedding.\"",
        "The conductor hears, laughs, and repeats it to the whole bus. Even the stern woman in front cracks a smile. {B} snorts so hard the box rattles.",
        "Then, right in the middle of Third Mainland Bridge, the engine gives one long sigh and stops. The lagoon glitters gold on both sides. Everyone groans. {B} looks at {A} and shrugs.",
      ],
      choices: [
        { label: "Walk the bridge together at sunset", to: "bridgewalk" },
        { label: "Wait it out and trade stories", to: "stories" },
      ],
    },
    popup: {
      chapter: 1,
      scene: "market",
      text: [
        "\"It's tiny,\" {B} says, which is what people say about things that are enormous to them. \"Six tables, fairy lights, and my aunt's recipe for coconut bread.\"",
        "By the time the danfo reaches the Island, {A} knows the names of every cake, the story behind the aunt, and that {B} hums when they're nervous.",
        "\"You should come,\" {B} says, already looking away like they didn't just say it. \"Later. If you want.\"",
      ],
      choices: [
        { label: "Show up early to help", to: "help" },
        { label: "Arrive later — with flowers", to: "flowers" },
      ],
    },
    carry: {
      chapter: 1,
      scene: "market",
      text: [
        "There are, it turns out, four more boxes stacked under the seat. {A} carries two, {B} carries two, and together they stagger off the bus like a very sweet delivery company.",
        "The pop-up is a strip of tables under a mango tree. Nothing is set up. The fairy lights are a tangled nest. {B} looks at the chaos and then at {A}, hopeful.",
      ],
      choices: [
        { label: "Roll up your sleeves and stay", to: "help" },
        { label: "Promise to come back with reinforcements", to: "flowers" },
      ],
    },
    bridgewalk: {
      chapter: 1,
      scene: "bridge",
      text: [
        "They climb out and walk along the bridge, the wind tugging at their clothes. Below, fishermen pull nets from water the colour of melted brass.",
        "{B} admits they want to open a bakery one day, a real one, with a blue door. {A} admits something they've never said aloud either.",
        "The sun sits fat and orange on the horizon, like it's waiting for them to finish.",
      ],
      choices: [
        { label: "Take a photo of the sunset together", to: "photo" },
        { label: "Race each other to the end of the bridge", to: "race" },
      ],
    },
    stories: {
      chapter: 1,
      scene: "city-night",
      text: [
        "Stuck in the bus, the passengers become a little village. The stern woman shares groundnuts. The conductor tells a story about a goat that once rode to Ikorodu.",
        "{A} and {B} trade the worst dates they've ever been on. {B} wins, unfortunately, with a story involving a pastor, a parrot and a power outage.",
        "When the engine finally roars back, nobody cheers louder than the two of them — and nobody looks more disappointed, either.",
      ],
      choices: [{ label: "Get off at the same stop, on purpose", to: "samestop" }],
    },
    help: {
      chapter: 1,
      scene: "market",
      text: [
        "The generator dies twenty minutes before opening. {A} kneels beside it, coaxes it back to life with a hairpin and sheer stubbornness, and the fairy lights blink on like applause.",
        "The crowd arrives. The coconut bread sells out in an hour. {B} keeps glancing over, cheeks dusted with flour, mouthing thank you between customers.",
        "When the last table is folded, the sky has turned purple and heavy.",
      ],
      choices: [{ label: "Walk them home", to: "rain" }],
    },
    flowers: {
      chapter: 1,
      scene: "market",
      text: [
        "{A} arrives as the stall is closing, holding sunflowers bought from a boy at a traffic light. Everything is sold out.",
        "{B} reaches under the table and produces one small coconut loaf wrapped in paper. \"I saved it,\" they say. \"Just in case you came.\"",
        "Thunder rolls somewhere over the lagoon, deep and patient.",
      ],
      choices: [{ label: "Share the loaf on the walk home", to: "rain" }],
    },
    photo: {
      chapter: 1,
      scene: "bridge",
      text: [
        "They squeeze into one frame, the sun behind them. The photo is blurry, half of {A}'s face is cut off, and it is somehow perfect.",
        "\"Send it to me,\" {B} says. Which means numbers are exchanged. Which means this is not the end of anything.",
        "By the time they reach the Island the first heavy raindrops are falling.",
      ],
      choices: [{ label: "Run for shelter", to: "rain" }],
    },
    race: {
      chapter: 2,
      scene: "bridge",
      text: [
        "\"Last one to the end buys suya!\" {A} shouts, and they're off — dodging okadas, leaping puddles, laughing so hard they can barely breathe.",
        "They tie. Obviously they tie. A suya man at the foot of the bridge, who has watched the whole thing, simply hands them two sticks and says, \"For the athletes.\"",
        "Years later, they still argue about who actually won.",
      ],
      ending: { id: "sprinters", title: "The Bridge Sprinters", mood: "funny" },
    },
    samestop: {
      chapter: 2,
      scene: "city-night",
      text: [
        "\"This is my stop,\" {A} says, standing up. \"This is my stop too,\" {B} says, which is obviously a lie, because {B} was going to Ajah.",
        "They step down together into a street smelling of roasting corn. Neither says anything about the lie.",
        "Above them, the sky is gathering itself for a downpour.",
      ],
      choices: [{ label: "Find somewhere to wait out the weather", to: "rain" }],
    },
    rain: {
      chapter: 2,
      scene: "rain",
      text: [
        "Lagos rain doesn't fall; it arrives. Within seconds the street is a river and the two of them are pressed under the awning of a mama put, the smell of pepper soup curling around them.",
        "{B}'s shoulder is warm against {A}'s. The rain is so loud it feels private, like the city has drawn a curtain just for them.",
        "Something needs to be said. Or done. Or carefully not said at all.",
      ],
      choices: [
        { label: "Confess you want to see them again", to: "confess" },
        { label: "Pull them out to dance in the rain", to: "dance" },
        { label: "Say goodnight, and hope", to: "hope" },
      ],
    },
    confess: {
      chapter: 2,
      scene: "home",
      text: [
        "\"I'd like to take the same bus tomorrow,\" {A} says. \"And the day after. If you're on it.\"",
        "{B} is quiet long enough for {A}'s heart to sink — then laughs softly. \"I don't even take that bus. I took it today because the other one was full.\" A pause. \"I'll take it tomorrow.\"",
        "They did. For a very long time.",
      ],
      ending: { id: "same-bus", title: "Same Bus Tomorrow", mood: "sweet" },
    },
    dance: {
      chapter: 2,
      scene: "rain",
      text: [
        "{A} holds out a hand. {B} looks at it, at the flooding street, at {A} — and takes it.",
        "They dance badly and joyfully in the warm rain while the mama put cheers and a passing danfo honks its approval. Someone's radio is playing highlife. It's the right song.",
        "Soaked to the bone, breathless, {B} says, \"You're trouble.\" {A} says, \"Only the good kind.\" They are both right.",
      ],
      ending: { id: "rain-dance", title: "Rain on the Island", mood: "epic" },
    },
    hope: {
      chapter: 2,
      scene: "stars",
      text: [
        "When the rain eases, they say goodnight. No numbers. Just a long look, and the feeling of a door left open.",
        "Two weeks later, {A} buys coconut bread from a new bakery with a blue door. Taped inside the paper is a note: \"I was hoping it'd be you. — {B}\"",
        "Some stories take the long road. That's alright. Lagos is full of long roads.",
      ],
      ending: { id: "blue-door", title: "The Blue Door", mood: "bittersweet" },
    },
  },
};
