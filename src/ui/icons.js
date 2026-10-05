// Наборы иконок: сферы, аватары людей, достижения. Разделены не по прихоти — на аватарах
// нужна пестрота, которой сферам не надо, а достижениям сверх того нужны «трофейные» иконки.
// Иконка Map берётся под псевдонимом MapIcon: её настоящее имя затенило бы глобальный
// конструктор Map, и любой `new Map(...)` в файле начал бы конструировать React-компонент.

import {
  Anchor, Award, Baby, Backpack, Bell, Bike, BookOpen, Bookmark, Brain, Briefcase, Building2, Cake,
  Camera, Car, Cat, Church, Code, Coffee, Coins, Compass, Crown, Dog, Dumbbell, Feather, Fish, Flag,
  Flame, Flower2, Footprints, Gamepad2, Gem, Ghost, Gift, Glasses, GraduationCap, Guitar, Hammer,
  Headphones, Heart, Home, Hourglass, Key, Leaf, Lightbulb, Medal, Mic2, Milestone, Moon, Mountain,
  Music, Paintbrush, Palette, PiggyBank, Plane, Puzzle, Rocket, School, Scissors, Shield, Smile,
  Snowflake, Sparkles, Star, Stethoscope, Sun, Sunrise, Swords, Target, Tent, Timer, TreePine,
  Trophy, Users, Utensils, Wallet, Wand2, Waves, Wrench, Zap, Map as MapIcon,
} from "lucide-react";

export const ICONS = { Heart, Coins, Briefcase, BookOpen, Users, Home, Palette, Brain, Compass, Star, Target, Shield, Sparkles, PiggyBank, Award, Gift, Wallet, Gem, Trophy };
export const ICON_KEYS = Object.keys(ICONS);
// Более широкий набор иконок специально для аватаров людей (сферам эта пестрота ни к чему).
export const PEOPLE_ICONS = {
  ...ICONS,
  Smile, Baby, Dog, Cat, GraduationCap, Cake, Music, Camera, Plane, Car,
  Bike, Coffee, Utensils, Sun, Moon, Gamepad2, Headphones, Paintbrush,
  Scissors, Stethoscope, Building2, School, Church, TreePine, Mountain,
  Waves, Glasses, Dumbbell, Guitar, Flower2, Mic2,
};
export const PEOPLE_ICON_KEYS = Object.keys(PEOPLE_ICONS);
// Достижения — про победы и вехи, поэтому к общему набору добавлены «трофейные» и «путевые»
// иконки: одних сфер жизни на выдуманное достижение не хватает.
export const ACHIEVEMENT_ICONS = {
  ...PEOPLE_ICONS,
  Flame, Crown, Medal, Rocket, Zap, Swords, Key, Map: MapIcon, Lightbulb, Anchor,
  Feather, Hourglass, Ghost, Snowflake, Leaf, Fish, Tent, Hammer, Wrench,
  Code, Timer, Footprints, Puzzle, Bell, Bookmark, Sunrise, Backpack, Wand2,
  Flag, Milestone, Gem, Trophy, Award,
};
export const ACHIEVEMENT_ICON_KEYS = Object.keys(ACHIEVEMENT_ICONS);
export function IconFor(name) { return ACHIEVEMENT_ICONS[name] || PEOPLE_ICONS[name] || ICONS[name] || Star; }
