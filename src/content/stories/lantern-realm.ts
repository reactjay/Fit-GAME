import type { Story } from "./types";

export const lanternRealm: Story = {
  id: "lantern-realm",
  title: "The Lantern Realm",
  tagline: "A door in an old baobab, a sky full of fading lights, and a quest for two.",
  emoji: "🏮",
  palette: ["#e2bd78", "#4b3fa8"],
  chapters: ["The Door in the Baobab", "The Sky Market", "The Heart of the Lantern"],
  start: "start",
  nodes: {
    start: {
      chapter: 0,
      scene: "forest",
      text: [
        "The storm drives {A} and {B} off the road and under the arms of an ancient baobab. Its bark is silver in the lightning, and it hums. Trees should not hum.",
        "In the trunk, where a moment ago there was only wood, there is a small round door with a brass handle shaped like two hands holding.",
        "Behind it, faintly, someone is singing.",
      ],
      choices: [
        { label: "Open it together", to: "open" },
        { label: "Knock first — politely", to: "knock" },
      ],
    },
    knock: {
      chapter: 0,
      scene: "forest",
      text: [
        "The door opens a crack. A tortoise wearing spectacles peers out. \"Old Shell,\" he says, by way of introduction. \"Nobody knocks anymore. I like you already.\"",
        "\"But rules are rules. Answer my riddle: I follow you all day and vanish when you hold each other close in the dark. What am I?\"",
      ],
      choices: [
        { label: "\"A shadow.\"", to: "riddle-right" },
        { label: "\"Loneliness.\"", to: "riddle-heart" },
      ],
    },
    "riddle-right": {
      chapter: 0,
      scene: "forest",
      text: [
        "\"Correct, and quickly!\" Old Shell beams and hands {A} a tiny lantern no bigger than a thumb. \"You'll need light where you're going. Most travellers don't get one of these.\"",
        "He steps aside. Beyond the door, the world falls upward.",
      ],
      choices: [{ label: "Step through, hand in hand", to: "open" }],
    },
    "riddle-heart": {
      chapter: 0,
      scene: "forest",
      text: [
        "Old Shell is quiet for a long moment. \"That is not the answer I wrote,\" he says. \"But it is a truer one.\"",
        "He gives {B} a tiny lantern no bigger than a thumb. \"For the two who know what the dark is really made of.\"",
        "He steps aside. Beyond the door, the world falls upward.",
      ],
      choices: [{ label: "Step through, hand in hand", to: "open" }],
    },
    open: {
      chapter: 0,
      scene: "sky",
      text: [
        "They tumble into a sky full of lanterns — thousands of them, drifting like slow fireflies over islands that float on the clouds.",
        "But many lanterns are dimming. One by one, they gutter out. A woman made of soft gold light descends: the Lantern Queen. \"Our lights are fed by kindness given freely,\" she says. \"Lately, there has not been enough. Will you help us?\"",
      ],
      choices: [
        { label: "\"Of course we will.\"", to: "market" },
        { label: "\"What's in it for us?\"", to: "bargain" },
      ],
    },
    bargain: {
      chapter: 0,
      scene: "sky",
      text: [
        "The Queen laughs, and a dozen lanterns brighten. \"Honesty! That feeds us too.\"",
        "\"Very well. Succeed, and you may each have one wish. Fail, and you'll only have each other — which, I suspect, you already know is not such a terrible prize.\"",
      ],
      choices: [{ label: "Shake on it", to: "market" }],
    },
    market: {
      chapter: 1,
      scene: "market",
      text: [
        "The Sky Market sprawls across the backs of three sleeping whales. Stalls sell bottled thunder, maps of dreams, and socks that are always warm.",
        "The Queen's instructions were simple: fill the empty jar with a song, a laugh, or a secret, freely given. The jar feels very heavy for something so empty.",
      ],
      choices: [
        { label: "Trade a song at the music stall", to: "song" },
        { label: "Try to make the grumpiest merchant laugh", to: "laugh" },
      ],
    },
    song: {
      chapter: 1,
      scene: "market",
      text: [
        "The music stall is run by a heron who only accepts duets. {A} and {B} pick the one song they both know every word to.",
        "They sing it badly, then well, then badly again because {B} forgot the second verse. The jar fills with warm light, and the heron dabs her eyes with a wing.",
      ],
      choices: [
        { label: "Hurry on toward the Heart", to: "heart" },
        { label: "Take a detour through the cloud gardens", to: "gardens" },
      ],
    },
    laugh: {
      chapter: 1,
      scene: "market",
      text: [
        "The grumpiest merchant is a goat who sells umbrellas for rain that falls upward. He has not laughed in three hundred years.",
        "{A} tries a joke. Nothing. Then {B} delivers a pun so terrible that {A} groans out loud — and the goat explodes into wheezing laughter. Lanterns flare across the whole market.",
      ],
      choices: [
        { label: "Hurry on toward the Heart", to: "heart" },
        { label: "Take a detour through the cloud gardens", to: "gardens" },
      ],
    },
    gardens: {
      chapter: 1,
      scene: "stars",
      text: [
        "In the cloud gardens grow flowers that open to show memories. One unfolds to show the first time {A} and {B} really talked — the place, the light, the nervous laughter.",
        "Another shows a moment neither has lived yet. They both look at it for a long time and decide not to say what they saw. They both smile, though.",
      ],
      choices: [{ label: "Carry that feeling to the Heart", to: "heart" }],
    },
    heart: {
      chapter: 2,
      scene: "dragon",
      text: [
        "At the centre of the realm hangs the Great Lantern, cold and dark. Coiled around it is a dragon made of shadow and every promise anyone ever forgot to keep.",
        "Its eyes open, two dim embers. \"Everyone leaves,\" it rumbles. \"Everyone forgets. Why should the lights stay on?\"",
        "{A} feels {B}'s hand tighten. The jar of light is warm between them.",
      ],
      choices: [
        { label: "Raise the jar and fight with the light", to: "fight" },
        { label: "Sit down and talk to the dragon", to: "talk" },
        { label: "Offer the dragon your wish", to: "wish" },
      ],
    },
    fight: {
      chapter: 2,
      scene: "castle",
      text: [
        "They lift the jar together and the light pours out like a sunrise. The dragon roars, unravels into a thousand shadows, and scatters into the wind.",
        "The Great Lantern blazes. Every light in the realm wakes at once. The Queen crowns them both Lantern-Bearers, which mostly means they get free socks at the market forever.",
        "When they step back out of the baobab, the storm has passed — and the stars look a little brighter than usual.",
      ],
      ending: { id: "bearers", title: "The Lantern-Bearers", mood: "epic" },
    },
    talk: {
      chapter: 2,
      scene: "stars",
      text: [
        "They sit right down at the dragon's claws. {B} asks it what promise it remembers most. The dragon, surprised, tells them: someone once promised to come back, and didn't.",
        "{A} and {B} tell it about the promises they've kept for each other — small ones, silly ones, the important ones. The dragon listens. Slowly it grows lighter, warmer, gold at the edges.",
        "It curls around the Great Lantern not as a guard but as a wick. The realm lights up. The dragon purrs. Dragons can purr, it turns out, if someone stays.",
      ],
      ending: { id: "dragon-promise", title: "The Dragon's New Promise", mood: "sweet" },
    },
    wish: {
      chapter: 2,
      scene: "sky",
      text: [
        "\"Take our wishes,\" {A} says. \"Wish to be remembered.\" The dragon trembles, and the wish settles into it like a seed. It glows, and the Great Lantern catches fire.",
        "The realm is saved, but the door is closing. \"You gave away your wishes,\" the Queen says gently. \"You must go home now, and you may not return.\"",
        "Back under the baobab, each of them finds a tiny lantern in their pocket. It glows whenever the other is thinking of them. Both lanterns are glowing right now.",
      ],
      ending: { id: "two-lanterns", title: "One Wish, Two Lanterns", mood: "bittersweet" },
    },
  },
};
