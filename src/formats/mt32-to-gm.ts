/**
 * MT-32 program → closest GM program (0-based), written by hand from the MT-32 owner's manual
 * preset list (the default patch memory is in that order). Eight entries per line.
 */
export const MT32_TO_GM: readonly number[] = [
  // AcouPiano 1-3, ElecPiano 1-4, Honkytonk
  0, 1, 2, 4, 5, 4, 5, 3,
  // ElecOrgan 1-4, PipeOrgan 1-3, Accordion
  16, 17, 18, 17, 19, 19, 20, 21,
  // Harpsi 1-3, Clavi 1-3, Celesta 1-2
  6, 6, 6, 7, 7, 7, 8, 8,
  // SynBrass 1-4, SynBass 1-4
  62, 63, 62, 63, 38, 39, 38, 39,
  // Fantasy, HarmoPan, Chorale, Glasses, Soundtrack, Atmosphere, WarmBell, FunnyVox
  88, 89, 52, 98, 97, 99, 98, 54,
  // EchoBell, IceRain, Oboe2001, EchoPan, DoctorSolo, SchoolDaze, Bellsinger, SquareWave
  102, 96, 68, 102, 80, 82, 54, 80,
  // StrSect 1-3, Pizzicato, Violin 1-2, Cello 1-2
  48, 49, 50, 45, 40, 40, 42, 42,
  // Contrabass, Harp 1-2, Guitar 1-2, ElecGtr 1-2, Sitar
  43, 46, 46, 24, 25, 27, 29, 104,
  // AcouBass 1-2, ElecBass 1-2, Slap 1-2, Fretless 1-2
  32, 33, 33, 34, 36, 37, 35, 35,
  // Flute 1-2, Piccolo 1-2, Recorder, PanPipes, Sax 1-2
  73, 73, 72, 72, 74, 75, 65, 66,
  // Sax 3-4, Clarinet 1-2, Oboe, EnglHorn, Bassoon, Harmonica
  64, 67, 71, 71, 68, 69, 70, 22,
  // Trumpet 1-2, Trombone 1-2, FrHorn 1-2, Tuba, BrsSect 1
  56, 56, 57, 57, 60, 60, 58, 61,
  // BrsSect 2, Vibe 1-2, SynMallet, Windbell, Glock, TubeBell, Xylophone
  61, 11, 11, 12, 9, 9, 14, 13,
  // Marimba, Koto, Sho, Shakuhachi, Whistle 1-2, Bottleblow, Breathpipe
  12, 107, 109, 77, 78, 78, 76, 122,
  // Timpani, MelodicTom, DeepSnare, ElecPerc 1-2, Taiko, TaikoRim, Cymbal
  47, 117, 118, 118, 118, 116, 116, 119,
  // Castanets, Triangle, OrcheHit, Telephone, BirdTweet, OneNoteJam, WaterBell, JungleTune
  115, 112, 55, 124, 123, 55, 98, 98,
]
