// Quote of the Week (Craft, 2026-10-09). One habit quote per week, the same
// for everyone, changing every Monday. Shown at the top of the Habits page
// and as the note on the "Read a motivational quote" habit.
//
// A hand-checked list instead of a live quote service: free quote services
// block browser apps or need paid keys, and quotes online are often
// credited to the wrong person. Every entry names who said it and where.
// "Attributed" = widely credited to them, but no original source is known.
// Add new quotes to the end - the weekly pick just cycles through the list.
const HABIT_QUOTES = [
    { text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', by: 'Will Durant', source: 'The Story of Philosophy (1926)', note: 'Summing up Aristotle' },
    { text: 'You do not rise to the level of your goals. You fall to the level of your systems.', by: 'James Clear', source: 'Atomic Habits (2018)' },
    { text: 'Every action you take is a vote for the type of person you wish to become.', by: 'James Clear', source: 'Atomic Habits (2018)' },
    { text: 'Habits are the compound interest of self-improvement.', by: 'James Clear', source: 'Atomic Habits (2018)' },
    { text: 'First forget inspiration. Habit is more dependable. Habit will sustain you whether you’re inspired or not.', by: 'Octavia E. Butler', source: '“Furor Scribendi,” Bloodchild and Other Stories (1995)' },
    { text: 'What you do every day matters more than what you do once in a while.', by: 'Gretchen Rubin', source: 'gretchenrubin.com (2011)' },
    { text: 'How we spend our days is, of course, how we spend our lives.', by: 'Annie Dillard', source: 'The Writing Life (1989)' },
    { text: 'All our life, so far as it has definite form, is but a mass of habits.', by: 'William James', source: 'Talks to Teachers on Psychology (1899)' },
    { text: 'Habit is habit, and not to be flung out of the window by any man, but coaxed down-stairs a step at a time.', by: 'Mark Twain', source: 'Pudd’nhead Wilson (1894)' },
    { text: 'Motivation is what gets you started. Habit is what keeps you going.', by: 'Jim Ryun', source: 'Attributed' }
];

// ISO week -> quote. Same week, same quote, on every device.
function quoteOfTheWeek(date = new Date()) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return HABIT_QUOTES[(d.getUTCFullYear() * 53 + week) % HABIT_QUOTES.length];
}

function quoteCredit(q) {
    return `${q.by}, ${q.source}${q.note ? ` · ${q.note}` : ''}`;
}
