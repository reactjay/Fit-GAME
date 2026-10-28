import type { Story } from "./types";

export const perfectDay: Story = {
  id: "perfect-day",
  title: "The Perfect Day (Allegedly)",
  tagline: "A carefully planned Saturday. What could possibly go wrong?",
  emoji: "🥞",
  palette: ["#f3a6bd", "#e2bd78"],
  chapters: ["Operation Breakfast", "The Great Outing", "Evening Plans"],
  start: "start",
  nodes: {
    start: {
      chapter: 0,
      scene: "kitchen",
      text: [
        "The plan was written on a sticky note: PERFECT DAY. 1) Breakfast. 2) Outing. 3) Romance. The handwriting is {B}'s. The confidence is also {B}'s.",
        "{A} wakes to the smoke alarm singing. In the kitchen, {B} stands in a cloud, holding a pan like a shield. \"Pancakes,\" they announce. \"Mostly.\"",
      ],
      choices: [
        { label: "Rescue the pancakes", to: "rescue" },
        { label: "Abandon ship — go buy akara and bread", to: "akara" },
      ],
    },
    rescue: {
      chapter: 0,
      scene: "kitchen",
      text: [
        "{A} takes over the flipping while {B} fans the smoke alarm with a cushion. The next pancake comes out perfectly golden — and shaped, inexplicably, exactly like the map of Nigeria.",
        "They stare at it in reverence. \"It's a sign,\" {B} whispers. \"Of what?\" \"I don't know. Patriotism.\"",
      ],
      choices: [
        { label: "Eat it proudly", to: "outing" },
        { label: "Photograph it for history first", to: "outing" },
      ],
    },
    akara: {
      chapter: 0,
      scene: "home",
      text: [
        "The akara lady is closed. A sign says GONE TO OWAMBE. BACK TOMORROW. They return home defeated and decide to make eggs together.",
        "This somehow turns into a flour fight, despite eggs not requiring flour. By the end, the kitchen is white, {B} has flour eyebrows, and breakfast is three slightly crunchy eggs. They are delicious.",
      ],
      choices: [{ label: "Clean up (eventually) and head out", to: "outing" }],
    },
    outing: {
      chapter: 1,
      scene: "city-night",
      text: [
        "Item two on the sticky note: OUTING. Underneath, in smaller letters: (somewhere nice).",
        "\"That's very specific,\" {A} says. {B} pretends not to hear. The day is bright and wide open. Where to?",
      ],
      choices: [
        { label: "Beach day", to: "beach" },
        { label: "Cinema and shawarma", to: "cinema" },
        { label: "Stay in and build a blanket fort", to: "fort" },
      ],
    },
    beach: {
      chapter: 1,
      scene: "beach",
      text: [
        "The beach is perfect for exactly four minutes, until the wind steals {B}'s hat and carries it toward the waves. The chase that follows is not graceful.",
        "The hat is finally returned by a man on a horse, who looks like he's been waiting his whole life for this moment. The horse looks at {A}. {A} looks at the horse.",
      ],
      choices: [
        { label: "Ask to ride the horse", to: "horse" },
        { label: "Build the greatest sandcastle Lagos has ever seen", to: "sandcastle" },
      ],
    },
    horse: {
      chapter: 1,
      scene: "beach",
      text: [
        "The horse is called Prince. Prince has opinions. Prince walks exactly three steps and then stops to eat someone's corn.",
        "{B} laughs until they cry and takes forty-one photos, all blurry. It is, by any honest measure, the best horse ride in history.",
      ],
      choices: [{ label: "Head home as the sun goes down", to: "evening" }],
    },
    sandcastle: {
      chapter: 1,
      scene: "beach",
      text: [
        "Two hours later they've built a sandcastle with a moat, a drawbridge, and a tiny sign reading OUR HOUSE. Children gather to watch. A wave politely waits until they've taken a photo before it washes everything away.",
        "\"We'll build a real one someday,\" {B} says. {A} pretends to be very interested in brushing off sand.",
      ],
      choices: [{ label: "Head home as the sun goes down", to: "evening" }],
    },
    cinema: {
      chapter: 1,
      scene: "city-night",
      text: [
        "They buy tickets for a romantic comedy and walk, through a confusing series of events, into a horror film instead. {B} screams at the opening credits.",
        "They stay anyway. {B} spends the entire film holding {A}'s arm and narrating everything that is about to go wrong. Afterwards, the shawarma is extra garlicky and absolutely heroic.",
      ],
      choices: [{ label: "Home, and check every corner for ghosts", to: "evening" }],
    },
    fort: {
      chapter: 1,
      scene: "home",
      text: [
        "The first blanket fort collapses in eight seconds. The second one, engineered with chairs, a broom, and alarming amounts of tape, is magnificent.",
        "Then NEPA takes light. Inside the dark fort, with one candle and two phones on low battery, they tell each other stories they've never told anyone. Nobody minds when the light comes back three hours later.",
      ],
      choices: [{ label: "Emerge for the evening", to: "evening" }],
    },
    evening: {
      chapter: 2,
      scene: "home",
      text: [
        "Item three on the sticky note: ROMANCE. It has been underlined twice and decorated with a heart that looks a bit like a potato.",
        "The day has gone completely, gloriously off-plan. There is one evening left to make it perfect. Or at least memorable.",
      ],
      choices: [
        { label: "Cook a fancy dinner together", to: "cook" },
        { label: "Karaoke night in the living room", to: "karaoke" },
        { label: "Climb onto the roof to stargaze", to: "stars" },
      ],
    },
    cook: {
      chapter: 2,
      scene: "kitchen",
      text: [
        "They attempt something called \"jollof risotto\" from a video. The smoke alarm, which has had a long day, gives up and just watches.",
        "It is slightly burnt and completely wonderful. They eat it on the floor by candlelight with their best plates. {B} declares it a five-star restaurant. {A} writes a review on the sticky note.",
      ],
      ending: { id: "chefs-kiss", title: "Chef's Kiss (Burnt)", mood: "funny" },
    },
    karaoke: {
      chapter: 2,
      scene: "stars",
      text: [
        "Hairbrushes become microphones. The sofa becomes a stage. {A} performs a power ballad with such feeling that a neighbour applauds through the wall.",
        "For the finale they sing a duet, terribly, gloriously, finishing on their knees. When the song ends, {B} is still holding {A}'s hand. Neither lets go.",
      ],
      ending: { id: "duet", title: "Duet of the Century", mood: "funny" },
    },
    stars: {
      chapter: 2,
      scene: "stars",
      text: [
        "On the roof the city hums beneath them, a sea of generators and distant music. Above, the sky is clearer than it has any right to be.",
        "{B} takes out the sticky note. Everything on it went wrong. \"Perfect day,\" {B} says, and isn't joking.",
        "{A} takes the pen and adds a fourth line: 4) Again tomorrow.",
      ],
      ending: { id: "again-tomorrow", title: "Again Tomorrow", mood: "sweet" },
    },
  },
};
