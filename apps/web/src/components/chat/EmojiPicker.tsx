'use client';
import React, { useState, useMemo } from 'react';

export interface EmojiCategory {
  id: string;
  name: string;
  icon: string;
  emojis: { char: string; name: string; keywords?: string[] }[];
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'frequent',
    name: 'Smileys & Emotion',
    icon: 'sentiment_satisfied',
    emojis: [
      { char: '😀', name: 'grinning face', keywords: ['smile', 'happy'] },
      { char: '😃', name: 'grinning face with big eyes', keywords: ['happy', 'joy'] },
      { char: '😄', name: 'grinning face with smiling eyes', keywords: ['laugh'] },
      { char: '😁', name: 'beaming face', keywords: ['grin'] },
      { char: '😆', name: 'grinning squinting face', keywords: ['haha'] },
      { char: '😅', name: 'sweat smile', keywords: ['relief'] },
      { char: '🤣', name: 'rofl', keywords: ['lol', 'laughing'] },
      { char: '😂', name: 'face with tears of joy', keywords: ['crying laugh'] },
      { char: '🙂', name: 'slightly smiling face', keywords: ['smile'] },
      { char: '😉', name: 'winking face', keywords: ['wink'] },
      { char: '😊', name: 'smiling face with smiling eyes', keywords: ['blush'] },
      { char: '😇', name: 'smiling face with halo', keywords: ['angel', 'holy'] },
      { char: '🥰', name: 'smiling face with hearts', keywords: ['love'] },
      { char: '😍', name: 'heart eyes', keywords: ['love', 'crush'] },
      { char: '🤩', name: 'star-struck', keywords: ['wow', 'stars'] },
      { char: '😘', name: 'face blowing a kiss', keywords: ['kiss'] },
      { char: '😗', name: 'kissing face', keywords: ['kiss'] },
      { char: '😚', name: 'kissing face with closed eyes', keywords: ['kiss'] },
      { char: '😙', name: 'kissing face with smiling eyes', keywords: ['kiss'] },
      { char: '😋', name: 'face savoring food', keywords: ['yum', 'delicious'] },
      { char: '😛', name: 'face with tongue', keywords: ['silly'] },
      { char: '😜', name: 'winking face with tongue', keywords: ['crazy', 'silly'] },
      { char: '🤪', name: 'zany face', keywords: ['goofy'] },
      { char: '😝', name: 'squinting face with tongue', keywords: ['playful'] },
      { char: '🤑', name: 'money-mouth face', keywords: ['rich', 'dollar'] },
      { char: '🤗', name: 'smiling face with open hands', keywords: ['hug'] },
      { char: '🤭', name: 'face with hand over mouth', keywords: ['oops'] },
      { char: '🤫', name: 'shushing face', keywords: ['quiet', 'secret'] },
      { char: '🤔', name: 'thinking face', keywords: ['wonder', 'think'] },
      { char: '🤐', name: 'zipper-mouth face', keywords: ['sealed'] },
      { char: '🤨', name: 'face with raised eyebrow', keywords: ['skeptical'] },
      { char: '😐', name: 'neutral face', keywords: ['meh'] },
      { char: '😑', name: 'expressionless face', keywords: ['blank'] },
      { char: '😶', name: 'face without mouth', keywords: ['silent'] },
      { char: '😏', name: 'smirking face', keywords: ['smug'] },
      { char: '😒', name: 'unamused face', keywords: ['bored'] },
      { char: '🙄', name: 'face with rolling eyes', keywords: ['eyeroll'] },
      { char: '😬', name: 'grimacing face', keywords: ['awkward'] },
      { char: '🤥', name: 'lying face', keywords: ['pinocchio'] },
      { char: '😌', name: 'relieved face', keywords: ['peace'] },
      { char: '😔', name: 'pensive face', keywords: ['sad'] },
      { char: '😪', name: 'sleepy face', keywords: ['tired'] },
      { char: '🤤', name: 'drooling face', keywords: ['drool'] },
      { char: '😴', name: 'sleeping face', keywords: ['zzz'] },
      { char: '😷', name: 'face with medical mask', keywords: ['sick'] },
      { char: '🤒', name: 'face with thermometer', keywords: ['ill', 'fever'] },
      { char: '🤕', name: 'face with head-bandage', keywords: ['hurt'] },
      { char: '🤢', name: 'nauseated face', keywords: ['disgust'] },
      { char: '🤮', name: 'face vomiting', keywords: ['puke'] },
      { char: '🤧', name: 'sneezing face', keywords: ['cold'] },
      { char: '🥵', name: 'hot face', keywords: ['heat'] },
      { char: '🥶', name: 'cold face', keywords: ['freezing'] },
      { char: '🥴', name: 'woozy face', keywords: ['dizzy'] },
      { char: '😵', name: 'face with crossed-out eyes', keywords: ['knocked out'] },
      { char: '🤯', name: 'exploding head', keywords: ['mind blown'] },
      { char: '🤠', name: 'cowboy hat face', keywords: ['sheriff'] },
      { char: '🥳', name: 'partying face', keywords: ['celebrate'] },
      { char: '😎', name: 'smiling face with sunglasses', keywords: ['cool'] },
      { char: '🤓', name: 'nerd face', keywords: ['geek'] },
      { char: '🧐', name: 'face with monocle', keywords: ['inspect'] },
    ],
  },
  {
    id: 'people_hands',
    name: 'Hands & Gestures',
    icon: 'front_hand',
    emojis: [
      { char: '👋', name: 'waving hand', keywords: ['hello', 'bye'] },
      { char: '🤚', name: 'raised back of hand', keywords: ['stop'] },
      { char: '🖐️', name: 'hand with fingers splayed', keywords: ['five'] },
      { char: '✋', name: 'raised hand', keywords: ['high five'] },
      { char: '🖖', name: 'vulcan salute', keywords: ['spock'] },
      { char: '👌', name: 'OK hand', keywords: ['perfect', 'good'] },
      { char: '🤌', name: 'pinched fingers', keywords: ['italian'] },
      { char: '🤏', name: 'pinching hand', keywords: ['small'] },
      { char: '✌️', name: 'victory hand', keywords: ['peace'] },
      { char: '🤞', name: 'crossed fingers', keywords: ['luck', 'hope'] },
      { char: '🤟', name: 'love-you gesture', keywords: ['ily'] },
      { char: '🤘', name: 'sign of the horns', keywords: ['rock'] },
      { char: '🤙', name: 'call me hand', keywords: ['phone', 'shaka'] },
      { char: '👈', name: 'backhand index pointing left', keywords: ['left'] },
      { char: '👉', name: 'backhand index pointing right', keywords: ['right'] },
      { char: '👆', name: 'backhand index pointing up', keywords: ['up'] },
      { char: '👇', name: 'backhand index pointing down', keywords: ['down'] },
      { char: '☝️', name: 'index pointing up', keywords: ['one'] },
      { char: '👍', name: 'thumbs up', keywords: ['approve', 'like', 'yes'] },
      { char: '👎', name: 'thumbs down', keywords: ['dislike', 'no'] },
      { char: '✊', name: 'raised fist', keywords: ['power'] },
      { char: '👊', name: 'oncoming fist', keywords: ['punch'] },
      { char: '🤛', name: 'left-facing fist', keywords: ['fist bump'] },
      { char: '🤜', name: 'right-facing fist', keywords: ['fist bump'] },
      { char: '👏', name: 'clapping hands', keywords: ['applause', 'bravo'] },
      { char: '🙌', name: 'raising hands', keywords: ['hallelujah', 'praise', 'celebration'] },
      { char: '👐', name: 'open hands', keywords: ['open'] },
      { char: '🤲', name: 'palms up together', keywords: ['prayer', 'dua'] },
      { char: '🤝', name: 'handshake', keywords: ['deal', 'agreement'] },
      { char: '🙏', name: 'folded hands', keywords: ['pray', 'please', 'thanks', 'amen'] },
      { char: '💪', name: 'flexed biceps', keywords: ['strong', 'power', 'gym'] },
      { char: '🦾', name: 'mechanical arm', keywords: ['robot'] },
      { char: '✍️', name: 'writing hand', keywords: ['write'] },
      { char: '💅', name: 'nail polish', keywords: ['beauty'] },
      { char: '🤳', name: 'selfie', keywords: ['camera', 'phone'] },
    ],
  },
  {
    id: 'faith_worship',
    name: 'Faith & Community',
    icon: 'church',
    emojis: [
      { char: '🙏', name: 'prayer hands', keywords: ['amen', 'worship', 'pray'] },
      { char: '🕊️', name: 'dove of peace', keywords: ['holy spirit', 'peace', 'bird'] },
      { char: '⛪', name: 'church', keywords: ['sanctuary', 'chapel', 'house'] },
      { char: '✝️', name: 'latin cross', keywords: ['jesus', 'christian', 'cross'] },
      { char: '📖', name: 'open book', keywords: ['bible', 'scripture', 'word'] },
      { char: '🕯️', name: 'candle', keywords: ['light', 'prayer'] },
      { char: '🔥', name: 'fire', keywords: ['holy ghost', 'revival', 'passion'] },
      { char: '👑', name: 'crown', keywords: ['king of kings', 'glory'] },
      { char: '🎺', name: 'trumpet', keywords: ['praise', 'sound'] },
      { char: '🎵', name: 'musical note', keywords: ['worship', 'choir', 'sing'] },
      { char: '🎶', name: 'musical notes', keywords: ['melody', 'hymn'] },
      { char: '🎙️', name: 'studio microphone', keywords: ['preaching', 'sermon', 'lead'] },
      { char: '🏛️', name: 'classical building', keywords: ['altar', 'temple'] },
      { char: '✨', name: 'sparkles', keywords: ['anointing', 'glory', 'shining'] },
      { char: '🌟', name: 'glowing star', keywords: ['bethlehem', 'shining'] },
      { char: '⭐', name: 'star', keywords: ['light'] },
      { char: '❤️', name: 'red heart', keywords: ['love of god', 'agape'] },
      { char: '🤍', name: 'white heart', keywords: ['purity', 'peace'] },
      { char: '🛡️', name: 'shield', keywords: ['faith', 'protection'] },
      { char: '⚔️', name: 'crossed swords', keywords: ['sword of the spirit'] },
      { char: '🥖', name: 'bread', keywords: ['communion', 'body'] },
      { char: '🍷', name: 'wine', keywords: ['communion', 'blood'] },
      { char: '🔔', name: 'bell', keywords: ['call to worship', 'service'] },
    ],
  },
  {
    id: 'hearts_symbols',
    name: 'Hearts & Symbols',
    icon: 'favorite',
    emojis: [
      { char: '❤️', name: 'red heart', keywords: ['love'] },
      { char: '🧡', name: 'orange heart', keywords: ['love'] },
      { char: '💛', name: 'yellow heart', keywords: ['love'] },
      { char: '💚', name: 'green heart', keywords: ['love'] },
      { char: '💙', name: 'blue heart', keywords: ['love'] },
      { char: '💜', name: 'purple heart', keywords: ['love'] },
      { char: '🖤', name: 'black heart', keywords: ['love'] },
      { char: '🤍', name: 'white heart', keywords: ['love'] },
      { char: '🤎', name: 'brown heart', keywords: ['love'] },
      { char: '💔', name: 'broken heart', keywords: ['sad'] },
      { char: '❣️', name: 'heart exclamation', keywords: ['love'] },
      { char: '💕', name: 'two hearts', keywords: ['love'] },
      { char: '💞', name: 'revolving hearts', keywords: ['love'] },
      { char: '💓', name: 'beating heart', keywords: ['love'] },
      { char: '💗', name: 'growing heart', keywords: ['love'] },
      { char: '💖', name: 'sparkling heart', keywords: ['love'] },
      { char: '💘', name: 'heart with arrow', keywords: ['cupid'] },
      { char: '💝', name: 'heart with ribbon', keywords: ['gift'] },
      { char: '💯', name: 'hundred points', keywords: ['score', 'perfect'] },
      { char: '🎉', name: 'party popper', keywords: ['congrats', 'celebration'] },
      { char: '🎊', name: 'confetti ball', keywords: ['party'] },
      { char: '🎁', name: 'wrapped gift', keywords: ['present'] },
      { char: '🏆', name: 'trophy', keywords: ['winner', 'first'] },
      { char: '🥇', name: '1st place medal', keywords: ['gold'] },
      { char: '🥈', name: '2nd place medal', keywords: ['silver'] },
      { char: '🥉', name: '3rd place medal', keywords: ['bronze'] },
      { char: '💡', name: 'light bulb', keywords: ['idea', 'insight'] },
      { char: '📌', name: 'pushpin', keywords: ['notice', 'pin'] },
      { char: '📍', name: 'round pushpin', keywords: ['location'] },
      { char: '✅', name: 'check mark button', keywords: ['done', 'correct'] },
      { char: '❌', name: 'cross mark', keywords: ['no', 'wrong'] },
      { char: '⚠️', name: 'warning', keywords: ['alert'] },
      { char: '🚀', name: 'rocket', keywords: ['launch', 'fast'] },
      { char: '⚡', name: 'high voltage', keywords: ['lightning', 'fast'] },
      { char: '🌈', name: 'rainbow', keywords: ['covenant', 'promise'] },
      { char: '☀️', name: 'sun', keywords: ['sunny', 'morning'] },
    ],
  },
  {
    id: 'objects_activities',
    name: 'Activities & Food',
    icon: 'sports_soccer',
    emojis: [
      { char: '⚽', name: 'soccer ball', keywords: ['football', 'sport'] },
      { char: '🏀', name: 'basketball', keywords: ['sport'] },
      { char: '🎾', name: 'tennis', keywords: ['sport'] },
      { char: '🏐', name: 'volleyball', keywords: ['sport'] },
      { char: '🏃', name: 'person running', keywords: ['run', 'fitness'] },
      { char: '🚗', name: 'automobile', keywords: ['car', 'travel'] },
      { char: '🚌', name: 'bus', keywords: ['transport', 'shuttle'] },
      { char: '✈️', name: 'airplane', keywords: ['flight', 'travel'] },
      { char: '☕', name: 'hot beverage', keywords: ['coffee', 'tea'] },
      { char: '🍕', name: 'pizza', keywords: ['food', 'lunch'] },
      { char: '🍔', name: 'hamburger', keywords: ['burger', 'food'] },
      { char: '🍩', name: 'doughnut', keywords: ['donut', 'sweet'] },
      { char: '🍎', name: 'red apple', keywords: ['fruit'] },
      { char: '🎂', name: 'birthday cake', keywords: ['celebration'] },
      { char: '🍰', name: 'shortcake', keywords: ['cake'] },
      { char: '🍿', name: 'popcorn', keywords: ['movie', 'snack'] },
      { char: '🍉', name: 'watermelon', keywords: ['fruit'] },
    ],
  },
];

export function WhatsAppEmojiPicker({
  onSelect,
  onClose,
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const [activeCategory, setActiveCategory] = useState(EMOJI_CATEGORIES[0].id);
  const [search, setSearch] = useState('');

  const filteredEmojis = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase().trim();
    const matches: { char: string; name: string }[] = [];
    const seen = new Set<string>();

    for (const cat of EMOJI_CATEGORIES) {
      for (const e of cat.emojis) {
        if (
          e.name.toLowerCase().includes(q) ||
          e.keywords?.some((k) => k.toLowerCase().includes(q)) ||
          e.char === q
        ) {
          if (!seen.has(e.char)) {
            seen.add(e.char);
            matches.push(e);
          }
        }
      }
    }
    return matches;
  }, [search]);

  return (
    <div className="w-80 sm:w-96 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xl backdrop-blur-md overflow-hidden flex flex-col h-80 z-30 animate-in fade-in zoom-in-95 duration-150">
      {/* Header with Search & Close */}
      <div className="p-2.5 border-b border-outline-variant/20 bg-surface-container-low flex items-center gap-2">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">
            search
          </span>
          <input
            type="text"
            placeholder="Search emoji (e.g. smile, pray, love)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-outline-variant/30 bg-surface-container-lowest text-xs text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
            autoFocus
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-xs">close</span>
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
          aria-label="Close emoji picker"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      {/* Category Tabs (when not searching) */}
      {!search && (
        <div className="flex items-center px-1 py-1 border-b border-outline-variant/15 bg-surface-container-low/60 overflow-x-auto no-scrollbar">
          {EMOJI_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex-1 py-1 px-2 rounded-lg flex items-center justify-center transition-all ${
                activeCategory === cat.id
                  ? 'bg-primary/10 text-primary font-bold shadow-xs'
                  : 'text-on-surface-variant/70 hover:bg-surface-container hover:text-on-surface'
              }`}
              title={cat.name}
            >
              <span className="material-symbols-outlined text-[18px]">{cat.icon}</span>
            </button>
          ))}
        </div>
      )}

      {/* Emoji Grid Container */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
        {filteredEmojis ? (
          <div>
            <p className="text-[11px] font-bold text-on-surface-variant mb-2 px-1">
              Search Results ({filteredEmojis.length})
            </p>
            {filteredEmojis.length === 0 ? (
              <p className="text-xs text-center text-on-surface-variant py-8">No matching emojis found</p>
            ) : (
              <div className="grid grid-cols-7 sm:grid-cols-8 gap-1">
                {filteredEmojis.map((emoji) => (
                  <button
                    key={emoji.char}
                    type="button"
                    onClick={() => onSelect(emoji.char)}
                    title={emoji.name}
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-xl hover:bg-surface-container-high hover:scale-125 active:scale-95 transition-all"
                  >
                    {emoji.char}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          EMOJI_CATEGORIES.filter((cat) => cat.id === activeCategory).map((cat) => (
            <div key={cat.id}>
              <p className="text-[11px] font-bold text-on-surface-variant mb-1.5 px-1 uppercase tracking-wider">
                {cat.name}
              </p>
              <div className="grid grid-cols-7 sm:grid-cols-8 gap-1">
                {cat.emojis.map((emoji) => (
                  <button
                    key={emoji.char}
                    type="button"
                    onClick={() => onSelect(emoji.char)}
                    title={emoji.name}
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-xl hover:bg-surface-container-high hover:scale-125 active:scale-95 transition-all"
                  >
                    {emoji.char}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bottom Quick Row for Instant Access */}
      <div className="p-2 border-t border-outline-variant/15 bg-surface-container-low/50 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-on-surface-variant">Quick reactions:</span>
        <div className="flex items-center gap-1">
          {['👍', '❤️', '😂', '🙏', '🙌', '🔥'].map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => onSelect(em)}
              className="text-base hover:scale-125 transition-transform p-0.5"
            >
              {em}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
