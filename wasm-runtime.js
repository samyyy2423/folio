// The part of the WebAssembly engine's runtime written once, as text that both back ends assemble: wasm.js here,
// and wasm.moth through wasm-runtime.moth, which make-wasm-runtime.mjs writes from this file. So the two can't
// drift apart, and the module each makes stays the same, byte for byte.
//
// It is WebAssembly's own instructions, a function at a time:
//
//     memory NAME PAGES              the module's memory, of so many 64 KiB pages, exported under its name
//     double NAME VALUE              a number for f64.const NAME
//     global NAME TYPE mut|const ... a global, and the instructions that make its first value
//     func NAME a:TYPE ... -> TYPE   a function, its inputs named, then what it gives (none, or one)
//     export NAME ...                the same, exported under its name for the JavaScript side
//     local NAME TYPE                a local, named
//
// and then the function's instructions, with `;;` starting a comment. A type is i32, i64, f64, eq (any Moth
// value), extern (a JavaScript value), ref:T or null:T (a reference to the module's type T: chars, text...).
// An instruction names a function as R.NAME, an import as im.NAME, a global as g.NAME, a type by its name, and
// a local or input by its name. A block, loop or if may be followed by its type: i32, i64, f64, eq or externref.
//
// What's here: text, which lives in the module as UTF-16, and numbers as text, to 15 digits as the VM shows them.

export const SOURCE = String.raw`
;; where text crosses to JavaScript and back, 32,768 units at a time
memory memory 1

;; ---------- doubles ----------
double d0 0
double d1 1
double d10 10
double dinf Infinity
double d2p53 9007199254740992

;; ---------- big whole numbers ----------
;; A big number is 32-bit limbs, lowest first, and how many are in use: at least 1, the top one not 0 unless
;; it's the only one. Six are made once, for working out a number's digits exactly (as machine.moth's are).
global bigR ref:big const i32.const 44 array.new_default ids i32.const 1 struct.new big
global bigS ref:big const i32.const 44 array.new_default ids i32.const 1 struct.new big
global bigMp ref:big const i32.const 44 array.new_default ids i32.const 1 struct.new big
global bigMm ref:big const i32.const 44 array.new_default ids i32.const 1 struct.new big
global bigT ref:big const i32.const 44 array.new_default ids i32.const 1 struct.new big
global bigU ref:big const i32.const 44 array.new_default ids i32.const 1 struct.new big

;; the digits of a number, as characters, and how many; where its point goes (it is 0.ddd times 10^dp)
global dbuf ref:chars const i32.const 40 array.new_default chars
global dn i32 mut i32.const 0
global dp i32 mut i32.const 0
;; a number's first 15 digits, rounded, as a whole number
global d15 i64 mut i64.const 0
;; a fraction below 1 times 2^120, in four limbs of 30 bits, highest first
global f0 i64 mut i64.const 0
global f1 i64 mut i64.const 0
global f2 i64 mut i64.const 0
global f3 i64 mut i64.const 0
;; a number's text as it's written, and how long it is so far
global nbuf ref:chars const i32.const 40 array.new_default chars
global nn i32 mut i32.const 0

;; b = v
func bigSet b:ref:big v:i64 ->
local a null:ids
local.get b struct.get big 0 local.set a
local.get a i32.const 0 local.get v i32.wrap_i64 array.set ids
local.get a i32.const 1 local.get v i64.const 32 i64.shr_u i32.wrap_i64 array.set ids
local.get b local.get v i64.const 32 i64.shr_u i64.eqz if i32 i32.const 1 else i32.const 2 end struct.set big 1

;; b = 2^k
func bigPow2 b:ref:big k:i32 ->
local a null:ids
local i i32
local q i32
local.get b struct.get big 0 local.set a
local.get k i32.const 5 i32.shr_u local.set q
block loop
  local.get i local.get q i32.ge_u br_if 1
  local.get a local.get i i32.const 0 array.set ids
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
local.get a local.get q i32.const 1 local.get k i32.const 31 i32.and i32.shl array.set ids
local.get b local.get q i32.const 1 i32.add struct.set big 1

;; b times m, which is below 2^32
func bigMul b:ref:big m:i64 ->
local a null:ids
local n i32
local i i32
local c i64
local t i64
local.get b struct.get big 0 local.set a
local.get m i64.eqz if
  local.get a i32.const 0 i32.const 0 array.set ids
  local.get b i32.const 1 struct.set big 1
  return
end
local.get b struct.get big 1 local.set n
block loop
  local.get i local.get n i32.ge_u br_if 1
  local.get a local.get i array.get ids i64.extend_i32_u local.get m i64.mul local.get c i64.add local.set t
  local.get a local.get i local.get t i32.wrap_i64 array.set ids
  local.get t i64.const 32 i64.shr_u local.set c
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
local.get c i64.eqz i32.eqz if
  local.get a local.get n local.get c i32.wrap_i64 array.set ids
  local.get b local.get n i32.const 1 i32.add struct.set big 1
end

;; b times 2^k
func bigShl b:ref:big k:i32 ->
block loop
  local.get k i32.eqz br_if 1
  local.get k i32.const 31 i32.gt_u if
    local.get b i64.const 2147483648 call R.bigMul
    local.get k i32.const 31 i32.sub local.set k
  else
    local.get b i64.const 1 local.get k i64.extend_i32_u i64.shl call R.bigMul
    i32.const 0 local.set k
  end
  br 0
end end

;; b times 10^k
func bigMulPow10 b:ref:big k:i32 ->
block loop
  local.get k i32.const 9 i32.lt_u br_if 1
  local.get b i64.const 1000000000 call R.bigMul
  local.get k i32.const 9 i32.sub local.set k
  br 0
end end
block loop
  local.get k i32.eqz br_if 1
  local.get b i64.const 10 call R.bigMul
  local.get k i32.const 1 i32.sub local.set k
  br 0
end end

;; x = y
func bigCopy x:ref:big y:ref:big ->
local.get x struct.get big 0 i32.const 0 local.get y struct.get big 0 i32.const 0 local.get y struct.get big 1 array.copy ids ids
local.get x local.get y struct.get big 1 struct.set big 1

;; x plus y
func bigAdd x:ref:big y:ref:big ->
local a null:ids
local n i32
local m i32
local i i32
local t i64
local c i64
local.get x struct.get big 0 local.set a
local.get x struct.get big 1 local.set n
local.get y struct.get big 1 local.set m
local.get m local.get n i32.gt_u if
  local.get n local.set i
  block loop
    local.get i local.get m i32.ge_u br_if 1
    local.get a local.get i i32.const 0 array.set ids
    local.get i i32.const 1 i32.add local.set i
    br 0
  end end
  local.get m local.set n
end
i32.const 0 local.set i
block loop
  local.get i local.get n i32.ge_u br_if 1
  local.get a local.get i array.get ids i64.extend_i32_u local.get c i64.add
  local.get i local.get m i32.lt_u if i64 local.get y struct.get big 0 local.get i array.get ids i64.extend_i32_u else i64.const 0 end
  i64.add local.set t
  local.get a local.get i local.get t i32.wrap_i64 array.set ids
  local.get t i64.const 32 i64.shr_u local.set c
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
local.get c i64.eqz i32.eqz if
  local.get a local.get n local.get c i32.wrap_i64 array.set ids
  local.get n i32.const 1 i32.add local.set n
end
local.get x local.get n struct.set big 1

;; x less y, which is no bigger
func bigSub x:ref:big y:ref:big ->
local a null:ids
local n i32
local m i32
local i i32
local t i64
local borrow i64
local.get x struct.get big 0 local.set a
local.get x struct.get big 1 local.set n
local.get y struct.get big 1 local.set m
block loop
  local.get i local.get n i32.ge_u br_if 1
  local.get a local.get i array.get ids i64.extend_i32_u
  local.get i local.get m i32.lt_u if i64 local.get y struct.get big 0 local.get i array.get ids i64.extend_i32_u else i64.const 0 end
  i64.sub local.get borrow i64.sub local.set t
  local.get a local.get i local.get t i32.wrap_i64 array.set ids
  local.get t i64.const 63 i64.shr_u local.set borrow
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
block loop
  local.get n i32.const 1 i32.le_u br_if 1
  local.get a local.get n i32.const 1 i32.sub array.get ids br_if 1
  local.get n i32.const 1 i32.sub local.set n
  br 0
end end
local.get x local.get n struct.set big 1

;; x against y: -1, 0 or 1
func bigCmp x:ref:big y:ref:big -> i32
local n i32
local i i32
local p i32
local q i32
local.get x struct.get big 1 local.tee n local.get y struct.get big 1 i32.ne if
  local.get n local.get y struct.get big 1 i32.lt_u if i32 i32.const -1 else i32.const 1 end return
end
local.get n local.set i
block loop
  local.get i i32.eqz br_if 1
  local.get i i32.const 1 i32.sub local.set i
  local.get x struct.get big 0 local.get i array.get ids local.set p
  local.get y struct.get big 0 local.get i array.get ids local.set q
  local.get p local.get q i32.ne if
    local.get p local.get q i32.lt_u if i32 i32.const -1 else i32.const 1 end return
  end
  br 0
end end
i32.const 0

;; b times v, which is below 2^54
func bigMulU64 b:ref:big v:i64 ->
local hi i64
local.get v i64.const 32 i64.shr_u local.tee hi i64.eqz if
  local.get b local.get v call R.bigMul return
end
global.get g.bigU local.get b call R.bigCopy
local.get b local.get v i64.const 4294967295 i64.and call R.bigMul
global.get g.bigU local.get hi call R.bigMul
global.get g.bigU i32.const 32 call R.bigShl
local.get b global.get g.bigU call R.bigAdd

;; ---------- a number's digits ----------

;; the digits of a whole number v (at least 0) go in dbuf, and how many in dn
func intDigits v:i64 ->
local n i32
local w i64
local.get v local.set w
block loop
  local.get n i32.const 1 i32.add local.set n
  local.get w i64.const 10 i64.div_u local.tee w i64.eqz br_if 1
  br 0
end end
local.get n global.set g.dn
local.get v local.set w
block loop
  local.get n i32.const 1 i32.sub local.set n
  global.get g.dbuf local.get n local.get w i64.const 10 i64.rem_u i32.wrap_i64 i32.const 48 i32.add array.set chars
  local.get w i64.const 10 i64.div_u local.tee w i64.eqz br_if 1
  br 0
end end

;; bits b to b + 29 of m times 2^s
func limb30 m:i64 s:i32 b:i32 -> i64
local.get s local.get b i32.ge_s if i64
  local.get s local.get b i32.sub i32.const 30 i32.ge_u if i64
    i64.const 0
  else
    local.get m local.get s local.get b i32.sub i64.extend_i32_u i64.shl i64.const 1073741823 i64.and
  end
else
  local.get b local.get s i32.sub i32.const 53 i32.ge_u if i64
    i64.const 0
  else
    local.get m local.get b local.get s i32.sub i64.extend_i32_u i64.shr_u i64.const 1073741823 i64.and
  end
end

;; the next digit of the fraction in f0 to f3, which keep the rest
func fracDigit -> i32
local t i64
global.get g.f3 i64.const 10 i64.mul local.set t
local.get t i64.const 1073741823 i64.and global.set g.f3
global.get g.f2 i64.const 10 i64.mul local.get t i64.const 30 i64.shr_u i64.add local.set t
local.get t i64.const 1073741823 i64.and global.set g.f2
global.get g.f1 i64.const 10 i64.mul local.get t i64.const 30 i64.shr_u i64.add local.set t
local.get t i64.const 1073741823 i64.and global.set g.f1
global.get g.f0 i64.const 10 i64.mul local.get t i64.const 30 i64.shr_u i64.add local.set t
local.get t i64.const 1073741823 i64.and global.set g.f0
local.get t i64.const 30 i64.shr_u i32.wrap_i64

;; d15 rounded by its 16th digit, half up, as toPrecision rounds
func round15 d:i32 ->
local.get d i32.const 5 i32.ge_u if
  global.get g.d15 i64.const 1 i64.add global.set g.d15
  global.get g.d15 i64.const 1000000000000000 i64.eq if
    i64.const 100000000000000 global.set g.d15
    global.get g.dp i32.const 1 i32.add global.set g.dp
  end
end

;; x, a number above 0 that isn't whole: its first 15 significant digits, rounded, in d15, and where the
;; point goes in dp. The whole part's digits come from it; the fraction's, from it times 2^120, exactly.
func dec15 x:f64 ->
local bits i64
local w i64
local m i64
local s i32
local k i32
local left i32
local d i64
local t i64
local.get x i64.reinterpret_f64 i64.const 52 i64.shr_u i32.wrap_i64 i32.const 955 i32.lt_u if
  local.get x call R.dec15Tiny return
end
local.get x i64.trunc_f64_u local.set w
local.get x local.get w f64.convert_i64_u f64.sub i64.reinterpret_f64 local.set bits
local.get bits i64.const 4503599627370495 i64.and i64.const 4503599627370496 i64.or local.set m
local.get bits i64.const 52 i64.shr_u i32.wrap_i64 i32.const 955 i32.sub local.set s
local.get m local.get s i32.const 90 call R.limb30 global.set g.f0
local.get m local.get s i32.const 60 call R.limb30 global.set g.f1
local.get m local.get s i32.const 30 call R.limb30 global.set g.f2
local.get m local.get s i32.const 0 call R.limb30 global.set g.f3
local.get w i64.eqz if
  block loop
    call R.fracDigit local.tee left br_if 1
    local.get k i32.const 1 i32.sub local.set k
    br 0
  end end
  local.get left i64.extend_i32_u local.set d
  i32.const 14 local.set left
else
  local.get w local.set t
  block loop
    local.get k i32.const 1 i32.add local.set k
    local.get t i64.const 10 i64.div_u local.tee t i64.eqz br_if 1
    br 0
  end end
  local.get k i32.const 16 i32.ge_u if
    local.get w i64.const 10 i64.div_u global.set g.d15
    local.get k global.set g.dp
    local.get w i64.const 10 i64.rem_u i32.wrap_i64 call R.round15
    return
  end
  local.get w local.set d
  i32.const 15 local.get k i32.sub local.set left
end
block loop
  local.get left i32.eqz br_if 1
  local.get d i64.const 10 i64.mul call R.fracDigit i64.extend_i32_u i64.add local.set d
  local.get left i32.const 1 i32.sub local.set left
  br 0
end end
local.get d global.set g.d15
local.get k global.set g.dp
call R.fracDigit call R.round15

;; the same for a number below 2^-68, with big whole numbers: x is R / S, and each digit is how many times S
;; goes into R
func dec15Tiny x:f64 ->
local bits i64
local be i32
local m i64
local q i32
local p i32
local d i32
local i i32
local.get x i64.reinterpret_f64 local.tee bits i64.const 52 i64.shr_u i32.wrap_i64 local.set be
local.get bits i64.const 4503599627370495 i64.and local.set m
local.get be if
  local.get m i64.const 4503599627370496 i64.or local.set m
  i32.const 1075 local.get be i32.sub local.set q
else
  i32.const 1074 local.set q
end
global.get g.bigR local.get m call R.bigSet
global.get g.bigS local.get q call R.bigPow2
i32.const 1 local.set p
block loop
  global.get g.bigR global.get g.bigS call R.bigCmp i32.const 0 i32.ge_s br_if 1
  global.get g.bigR i64.const 10 call R.bigMul
  local.get p i32.const 1 i32.sub local.set p
  br 0
end end
i64.const 0 global.set g.d15
block loop
  i32.const 0 local.set d
  block loop
    global.get g.bigR global.get g.bigS call R.bigCmp i32.const 0 i32.lt_s br_if 1
    global.get g.bigR global.get g.bigS call R.bigSub
    local.get d i32.const 1 i32.add local.set d
    br 0
  end end
  local.get i i32.const 15 i32.eq br_if 1
  global.get g.d15 i64.const 10 i64.mul local.get d i64.extend_i32_u i64.add global.set g.d15
  global.get g.bigR i64.const 10 call R.bigMul
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
local.get p global.set g.dp
local.get d call R.round15

;; 10^k, for k from 0 to 22, which a double holds exactly
func pow10 k:i32 -> f64
local v f64
f64.const d1 local.set v
block loop
  local.get k i32.eqz br_if 1
  local.get v f64.const d10 f64.mul local.set v
  local.get k i32.const 1 i32.sub local.set k
  br 0
end end
local.get v

;; S times (2f + side), against R
func timesOdd f:i64 side:i64 -> i32
global.get g.bigT global.get g.bigS call R.bigCopy
global.get g.bigT local.get f i64.const 1 i64.shl local.get side i64.add call R.bigMulU64
global.get g.bigT global.get g.bigR call R.bigCmp

;; x, a number above 0 that isn't whole: the double nearest its value to 15 digits, D times 10^p, as canon in
;; vm.js. With p from -22 up, D and 10^-p are both exact, so one multiplication or division rounds it right.
;; Below that, it is f times 2^e for the f closest to D times 2^-e over 10^-p, worked out with big whole
;; numbers at the scale of x itself, or the one next to it if f leaves it.
func canon x:f64 -> f64
local p i32
local f i64
local e i32
local be i32
local c i32
local.get x call R.dec15
global.get g.dp i32.const 15 i32.sub local.tee p i32.const -22 i32.ge_s if
  local.get p i32.const 0 i32.ge_s if f64
    global.get g.d15 f64.convert_i64_u local.get p call R.pow10 f64.mul
  else
    global.get g.d15 f64.convert_i64_u i32.const 0 local.get p i32.sub call R.pow10 f64.div
  end
  return
end
global.get g.bigS i64.const 1 call R.bigSet
global.get g.bigS i32.const 0 local.get p i32.sub call R.bigMulPow10
local.get x i64.reinterpret_f64 i64.const 52 i64.shr_u i32.wrap_i64 local.set be
local.get x i64.reinterpret_f64 i64.const 4503599627370495 i64.and local.set f
local.get be if
  local.get f i64.const 4503599627370496 i64.or local.set f
  local.get be i32.const 1075 i32.sub local.set e
else
  i32.const -1074 local.set e
end
loop
  ;; R: D times 2^(1 - e)
  global.get g.bigR global.get g.d15 call R.bigSet
  global.get g.bigR i32.const 1 local.get e i32.sub call R.bigShl
  ;; up while the value is past f + 1/2
  block loop
    local.get f i64.const 1 call R.timesOdd local.tee c i32.const 0 i32.ge_s br_if 1
    local.get f i64.const 1 i64.add local.set f
    br 0
  end end
  local.get c i32.eqz if
    ;; halfway: to the even one
    local.get f i64.const 1 i64.and i64.eqz i32.eqz if local.get f i64.const 1 i64.add local.set f end
  else
    ;; down while it's short of f - 1/2
    block loop
      local.get f i64.eqz br_if 1
      local.get f i64.const -1 call R.timesOdd local.tee c i32.const 0 i32.lt_s br_if 1
      local.get c i32.eqz local.get f i64.const 1 i64.and i64.eqz i32.and br_if 1
      local.get f i64.const 1 i64.sub local.set f
      br 0
    end end
  end
  ;; f out of its 53 bits: the scale next to it
  local.get f i64.const 9007199254740992 i64.ge_u if
    local.get f i64.const 1 i64.shr_u local.set f
    local.get e i32.const 1 i32.add local.set e
    br 1
  end
  local.get f i64.const 4503599627370496 i64.lt_u local.get e i32.const -1074 i32.gt_s i32.and if
    local.get f i64.const 1 i64.shl local.set f
    local.get e i32.const 1 i32.sub local.set e
    br 1
  end
end
local.get f i64.const 4503599627370496 i64.lt_u if f64
  local.get f f64.reinterpret_i64
else
  local.get f i64.const 4503599627370496 i64.sub local.get e i32.const 1075 i32.add i64.extend_i32_u i64.const 52 i64.shl i64.or f64.reinterpret_i64
end

;; R + M+ against S
func high -> i32
global.get g.bigT global.get g.bigR call R.bigCopy
global.get g.bigT global.get g.bigMp call R.bigAdd
global.get g.bigT global.get g.bigS call R.bigCmp

;; ten times R + M+ against S
func highTen -> i32
global.get g.bigT global.get g.bigR call R.bigCopy
global.get g.bigT global.get g.bigMp call R.bigAdd
global.get g.bigT i64.const 10 call R.bigMul
global.get g.bigT global.get g.bigS call R.bigCmp

;; x, a number above 0: dbuf gets the fewest digits that read back as it, dn how many, dp where the point
;; goes. The number is R / S, and M+ and M- are how far each way a number can be and still read back as it,
;; all doubled so they're whole (Steele and White's way, as machine.moth's rt_shortest).
func shortest x:f64 ->
local bits i64
local frac i64
local f i64
local e i32
local even i32
local be i32
local k i32
local n i32
local d i32
local low i32
local high i32
local c i32
local.get x i64.reinterpret_f64 local.tee bits i64.const 4503599627370495 i64.and local.tee frac local.set f
local.get bits i64.const 52 i64.shr_u i32.wrap_i64 local.tee be if
  local.get f i64.const 4503599627370496 i64.or local.set f
else
  i32.const 1 local.set be
end
local.get be i32.const 1075 i32.sub local.set e
local.get f i32.wrap_i64 i32.const 1 i32.and i32.eqz local.set even
local.get e i32.const 0 i32.ge_s if
  local.get frac i64.eqz if
    ;; a power of two: the next number down is closer than the next one up
    global.get g.bigR local.get e i32.const 2 i32.add call R.bigPow2
    global.get g.bigR local.get f call R.bigMulU64
    global.get g.bigS i64.const 4 call R.bigSet
    global.get g.bigMp local.get e i32.const 1 i32.add call R.bigPow2
    global.get g.bigMm local.get e call R.bigPow2
  else
    global.get g.bigR local.get e i32.const 1 i32.add call R.bigPow2
    global.get g.bigR local.get f call R.bigMulU64
    global.get g.bigS i64.const 2 call R.bigSet
    global.get g.bigMp local.get e call R.bigPow2
    global.get g.bigMm local.get e call R.bigPow2
  end
else
  ;; R = 2f and S = 2^(1 - e), or twice both for a power of two
  i32.const 1 local.set c
  local.get e i32.const -1074 i32.ne local.get frac i64.eqz i32.and if i32.const 2 local.set c end
  global.get g.bigR local.get f call R.bigSet
  global.get g.bigR local.get c i64.extend_i32_u i64.const 1 i64.shl call R.bigMul
  global.get g.bigS local.get c local.get e i32.sub call R.bigPow2
  global.get g.bigMp local.get c i64.extend_i32_u call R.bigSet
  global.get g.bigMm i64.const 1 call R.bigSet
end
;; R, M+ and M- times 10 while ten times R + M+ is short of S
block loop
  call R.highTen local.tee c i32.const 0 i32.gt_s br_if 1
  local.get c i32.eqz local.get even i32.and br_if 1
  global.get g.bigR i64.const 10 call R.bigMul
  global.get g.bigMp i64.const 10 call R.bigMul
  global.get g.bigMm i64.const 10 call R.bigMul
  local.get k i32.const 1 i32.sub local.set k
  br 0
end end
;; S times 10 while R + M+ reaches it
block loop
  call R.high local.tee c i32.const 0 i32.lt_s br_if 1
  local.get c i32.eqz local.get even i32.eqz i32.and br_if 1
  global.get g.bigS i64.const 10 call R.bigMul
  local.get k i32.const 1 i32.add local.set k
  br 0
end end
block loop
  global.get g.bigR i64.const 10 call R.bigMul
  global.get g.bigMp i64.const 10 call R.bigMul
  global.get g.bigMm i64.const 10 call R.bigMul
  i32.const 0 local.set d
  block loop
    global.get g.bigR global.get g.bigS call R.bigCmp i32.const 0 i32.lt_s br_if 1
    global.get g.bigR global.get g.bigS call R.bigSub
    local.get d i32.const 1 i32.add local.set d
    br 0
  end end
  ;; low: R is within M- of 0; high: R + M+ reaches S (each counting halfway when f is even)
  global.get g.bigR global.get g.bigMm call R.bigCmp local.tee c i32.const 0 i32.lt_s
  local.get c i32.eqz local.get even i32.and i32.or local.set low
  call R.high local.tee c i32.const 0 i32.gt_s
  local.get c i32.eqz local.get even i32.and i32.or local.set high
  local.get low local.get high i32.or br_if 1
  global.get g.dbuf local.get n local.get d i32.const 48 i32.add array.set chars
  local.get n i32.const 1 i32.add local.set n
  br 0
end end
local.get low if
  local.get high if
    ;; both: the digit nearer x, and the even one at a tie
    global.get g.bigT global.get g.bigR call R.bigCopy
    global.get g.bigT global.get g.bigR call R.bigAdd
    global.get g.bigT global.get g.bigS call R.bigCmp local.tee c i32.const 0 i32.gt_s
    local.get c i32.eqz local.get d i32.const 1 i32.and i32.and i32.or if
      local.get d i32.const 1 i32.add local.set d
    end
  end
else
  local.get d i32.const 1 i32.add local.set d
end
global.get g.dbuf local.get n local.get d i32.const 48 i32.add array.set chars
local.get n i32.const 1 i32.add global.set g.dn
local.get k global.set g.dp

;; ---------- a number as text ----------

;; c at the end of the number's text
func nput c:i32 ->
global.get g.nbuf global.get g.nn local.get c array.set chars
global.get g.nn i32.const 1 i32.add global.set g.nn

;; the digits from place 'from' to 'to' (not counting it), at the end of the number's text
func nputDigits from:i32 to:i32 ->
block loop
  local.get from local.get to i32.ge_s br_if 1
  global.get g.dbuf local.get from array.get_u chars call R.nput
  local.get from i32.const 1 i32.add local.set from
  br 0
end end

;; the dn digits in dbuf, with the point dp digits in, as JavaScript lays them out
func layout ->
local k i32
local n i32
global.get g.dp local.set k
global.get g.dn local.set n
local.get k local.get n i32.ge_s if
  local.get k i32.const 21 i32.le_s if
    ;; 1200: the digits, then zeros
    i32.const 0 local.get n call R.nputDigits
    block loop
      local.get n local.get k i32.ge_s br_if 1
      i32.const 48 call R.nput
      local.get n i32.const 1 i32.add local.set n
      br 0
    end end
    return
  end
else
  local.get k i32.const 0 i32.gt_s if
    ;; 12.5: some digits, a point, the rest
    i32.const 0 local.get k call R.nputDigits
    i32.const 46 call R.nput
    local.get k local.get n call R.nputDigits
    return
  end
  local.get k i32.const -6 i32.gt_s if
    ;; 0.005: a point, zeros, the digits
    i32.const 48 call R.nput
    i32.const 46 call R.nput
    block loop
      local.get k i32.eqz br_if 1
      i32.const 48 call R.nput
      local.get k i32.const 1 i32.add local.set k
      br 0
    end end
    i32.const 0 local.get n call R.nputDigits
    return
  end
end
;; 1.5e+21: a digit, maybe a point and the rest, e and the power of ten
i32.const 0 i32.const 1 call R.nputDigits
local.get n i32.const 1 i32.gt_s if
  i32.const 46 call R.nput
  i32.const 1 local.get n call R.nputDigits
end
i32.const 101 call R.nput
local.get k i32.const 1 i32.sub local.tee k i32.const 0 i32.lt_s if
  i32.const 45 call R.nput
  i32.const 0 local.get k i32.sub local.set k
else
  i32.const 43 call R.nput
end
local.get k i64.extend_i32_u call R.intDigits
i32.const 0 global.get g.dn call R.nputDigits

;; the number's text, made
func nmade -> eq
local a null:chars
global.get g.nn array.new_default chars local.tee a
i32.const 0 global.get g.nbuf i32.const 0 global.get g.nn array.copy chars chars
local.get a global.get g.nn call R.newText

;; x as text, as the VM shows a number: to 15 digits, laid out as JavaScript lays numbers out
func numText x:f64 -> eq
i32.const 0 global.set g.nn
local.get x local.get x f64.ne if
  i32.const 78 call R.nput i32.const 97 call R.nput i32.const 78 call R.nput
  call R.nmade return
end
local.get x f64.const d0 f64.eq if
  i32.const 48 call R.nput
  call R.nmade return
end
local.get x f64.const d0 f64.lt if
  i32.const 45 call R.nput
  local.get x f64.neg local.set x
end
local.get x f64.const dinf f64.eq if
  i32.const 73 call R.nput i32.const 110 call R.nput i32.const 102 call R.nput i32.const 105 call R.nput
  i32.const 110 call R.nput i32.const 105 call R.nput i32.const 116 call R.nput i32.const 121 call R.nput
  call R.nmade return
end
local.get x f64.const d2p53 f64.ge if
  ;; whole, and past what a double counts by 1: the fewest digits that read back as it
  local.get x call R.shortest call R.layout
  call R.nmade return
end
local.get x local.get x f64.trunc f64.eq if
  local.get x i64.trunc_f64_u call R.intDigits
  global.get g.dn global.set g.dp
  call R.layout
  call R.nmade return
end
local.get x i64.reinterpret_f64 i64.const 52 i64.shr_u i32.wrap_i64 i32.const 1 i32.le_u if
  ;; so small that 15 digits don't read back as one double each: the double they read back as, shortest
  local.get x call R.canon call R.shortest call R.layout
  call R.nmade return
end
local.get x call R.dec15
global.get g.d15 call R.intDigits
;; less the zeros at the end
block loop
  global.get g.dn i32.const 1 i32.le_u br_if 1
  global.get g.dbuf global.get g.dn i32.const 1 i32.sub array.get_u chars i32.const 48 i32.ne br_if 1
  global.get g.dn i32.const 1 i32.sub global.set g.dn
  br 0
end end
call R.layout
call R.nmade

export numberText x:f64 -> eq
local.get x call R.numText

;; ---------- text ----------
;; Text is a view of the first 'len' units of a buffer: its UTF-16 units, and how many of them are in use, so
;; text that ends where its buffer's in-use units end can have more added in place, and joining text in a
;; loop takes as long as the text is. Units past those in use are never changed, so every view stays as it was.
;; Text JavaScript made keeps its string, and gets units only when the module needs them (im.fill).

;; text of the first n units of an array, which it owns
func newText units:null:chars n:i32 -> ref:text
local.get units local.get n struct.new strbuf local.get n ref.null extern struct.new text

;; t's units
func units t:eq -> null:chars
local x null:text
local.get t ref.cast text local.tee x struct.get text 0 ref.is_null if
  local.get t call im.fill
end
local.get x struct.get text 0 struct.get strbuf 0

;; t's JavaScript string, made once
func jsOf t:eq -> extern
local x null:text
local s extern
local.get t ref.cast text local.tee x struct.get text 2 local.tee s ref.is_null if externref
  local.get x local.get t call im.jsText local.tee s struct.set text 2
  local.get s
else
  local.get s
end

;; how many units a buffer for n of them has, with room to grow
func roomFor n:i32 -> i32
local r i32
local.get n i32.const 268435456 i32.ge_u if
  local.get n return
end
local.get n local.get n i32.const 1 i32.shr_u i32.add i32.const 8 i32.add local.tee r
i32.const 536870888 i32.gt_u if i32 i32.const 536870888 else local.get r end

;; text a then text b, as one
func concat a:eq b:eq -> eq
local x null:text
local buf null:strbuf
local au null:chars
local fresh null:chars
local n i32
local m i32
local total i32
local.get a ref.cast text local.tee x struct.get text 1 local.set n
local.get b ref.cast text struct.get text 1 local.tee m i32.eqz if
  local.get a return
end
local.get n i32.eqz if
  local.get b return
end
local.get n local.get m i32.add local.tee total i32.const 536870888 i32.gt_u if
  ;; longer than JavaScript's longest text: the VM says what that does
  call im.tooDeep
end
local.get a call R.units local.set au
local.get x struct.get text 0 local.tee buf struct.get strbuf 1 local.get n i32.eq if
  ;; a ends where its buffer's text does: b goes after it, in place
  local.get au array.len local.get total i32.lt_u if
    ;; no room: a bigger array, for a and the text it begins
    local.get total call R.roomFor array.new_default chars local.tee fresh
    i32.const 0 local.get au i32.const 0 local.get n array.copy chars chars
    local.get buf local.get fresh struct.set strbuf 0
    local.get fresh local.set au
  end
  local.get au local.get n local.get b call R.units i32.const 0 local.get m array.copy chars chars
  local.get buf local.get total struct.set strbuf 1
  local.get buf local.get total ref.null extern struct.new text
  return
end
;; a begins longer text already: both copied into a new array
local.get total call R.roomFor array.new_default chars local.tee fresh
i32.const 0 local.get au i32.const 0 local.get n array.copy chars chars
local.get fresh local.get n local.get b call R.units i32.const 0 local.get m array.copy chars chars
local.get fresh local.get total struct.new strbuf local.get total ref.null extern struct.new text

;; 1 if texts a and b have the same units
func sameText a:eq b:eq -> i32
local p null:chars
local q null:chars
local n i32
local i i32
local.get a ref.cast text struct.get text 1 local.tee n local.get b ref.cast text struct.get text 1 i32.ne if
  i32.const 0 return
end
local.get a call R.units local.set p
local.get b call R.units local.tee q local.get p ref.eq if
  i32.const 1 return
end
block loop
  local.get i local.get n i32.ge_u br_if 1
  local.get p local.get i array.get_u chars local.get q local.get i array.get_u chars i32.ne if
    i32.const 0 return
  end
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
i32.const 1

;; texts a and b in order, as JavaScript orders strings (unit by unit): -1, 0 or 1
func textOrder a:eq b:eq -> i32
local p null:chars
local q null:chars
local n i32
local m i32
local i i32
local u i32
local v i32
local.get a ref.cast text struct.get text 1 local.set n
local.get b ref.cast text struct.get text 1 local.set m
local.get a call R.units local.set p
local.get b call R.units local.set q
block loop
  local.get i local.get n i32.ge_u local.get i local.get m i32.ge_u i32.or br_if 1
  local.get p local.get i array.get_u chars local.tee u local.get q local.get i array.get_u chars local.tee v i32.ne if
    local.get u local.get v i32.lt_u if i32 i32.const -1 else i32.const 1 end return
  end
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
local.get n local.get m i32.lt_u if i32 i32.const -1 else local.get n local.get m i32.gt_u end

;; ---------- what JavaScript calls to move text in and out ----------

;; a text's JavaScript string, if it has one yet, or null
export textJs t:eq -> extern
local.get t ref.cast text struct.get text 2

export setTextJs t:eq s:extern ->
local.get t ref.cast text local.get s struct.set text 2

export textLength t:eq -> i32
local.get t ref.cast text struct.get text 1

export textUnit t:eq i:i32 -> i32
local.get t call R.units local.get i array.get_u chars

;; text JavaScript made: its string, and how many units it has
export makeTextJs s:extern n:i32 -> eq
ref.null strbuf local.get n local.get s struct.new text

;; units for text JavaScript made, for it to fill in with textPut
export textBegin t:eq ->
local x null:text
local.get t ref.cast text local.tee x local.get x struct.get text 1 array.new_default chars local.get x struct.get text 1 struct.new strbuf struct.set text 0

export textPut t:eq i:i32 c:i32 ->
local.get t ref.cast text struct.get text 0 struct.get strbuf 0 local.get i local.get c array.set chars

;; t's units from place 'from' on, 32,768 at most, copied into the memory for JavaScript to read; how many
export textOut t:eq from:i32 -> i32
local u null:chars
local n i32
local i i32
local.get t call R.units local.set u
local.get t ref.cast text struct.get text 1 local.get from i32.sub local.tee n i32.const 32768 i32.gt_u if
  i32.const 32768 local.set n
end
block loop
  local.get i local.get n i32.ge_u br_if 1
  local.get i i32.const 1 i32.shl local.get u local.get from local.get i i32.add array.get_u chars i32.store16 1 0
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
local.get n

;; t's JavaScript string, if it has one; if not, null, with how many units it has in the memory's first 4 bytes
;; and the first 32,766 of them after, for JavaScript to make the string from (and textOut the rest), in one call
export textView t:eq -> extern
local s extern
local u null:chars
local n i32
local i i32
local.get t ref.cast text struct.get text 2 local.tee s ref.is_null i32.eqz if
  local.get s return
end
local.get t call R.units local.set u
i32.const 0 local.get t ref.cast text struct.get text 1 local.tee n i32.store 2 0
local.get n i32.const 32766 i32.gt_u if
  i32.const 32766 local.set n
end
block loop
  local.get i local.get n i32.ge_u br_if 1
  local.get i i32.const 1 i32.shl local.get u local.get i array.get_u chars i32.store16 1 4
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
ref.null extern

;; the same for a list's item i, which may not be text: then null, with -1 in the memory's first 4 bytes
export listView l:eq i:i32 -> extern
local it eq
local.get l ref.cast list struct.get list 0 local.get i array.get items local.tee it ref.test text if externref
  local.get it call R.textView
else
  i32.const 0 i32.const -1 i32.store 2 0
  ref.null extern
end

;; n units JavaScript put in the memory, copied into t's from place 'at' on (see textBegin)
export textIn t:eq at:i32 n:i32 ->
local u null:chars
local i i32
local.get t ref.cast text struct.get text 0 struct.get strbuf 0 local.set u
block loop
  local.get i local.get n i32.ge_u br_if 1
  local.get u local.get at local.get i i32.add local.get i i32.const 1 i32.shl i32.load16_u 1 0 array.set chars
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
`;

// ---------- reading it ----------

const DOUBLE_BYTES = (value) => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, true);
  return [...new Uint8Array(view.buffer)];
};

// The source as both back ends read it: no comments, a line for each double (with its 8 bytes), global,
// function and local, and all of a function's instructions on one line after them, starting `code`.
export function clean(source) {
  const out = [];
  let code = null;
  const flush = () => {
    if (code !== null) out.push(`code ${code.join(" ")}`.trimEnd());
    code = null;
  };
  for (const raw of source.split("\n")) {
    const line = raw.replace(/;;.*$/, "").trim().replace(/\s+/g, " ");
    if (!line) continue;
    const [word, ...rest] = line.split(" ");
    if (word === "double") {
      flush();
      out.push(`double ${rest[0]} ${DOUBLE_BYTES(Number(rest[1])).join(" ")}`);
    } else if (word === "global" || word === "memory") {
      flush();
      out.push(line);
    } else if (word === "func" || word === "export") {
      flush();
      out.push(line);
      code = [];
    } else if (word === "local") {
      if (code === null || code.length) throw new Error(`wasm-runtime.js: a local comes before a function's instructions: ${line}`);
      out.push(line);
    } else {
      if (code === null) throw new Error(`wasm-runtime.js: instructions outside a function: ${line}`);
      code.push(line);
    }
  }
  flush();
  return out.join("\n");
}

export const RUNTIME = clean(SOURCE);

// What the cleaned source holds: { memories: [{ name, pages }], doubles: Map of name to value, globals: [{ name,
// type, mutable, init }], funcs: [{ name, exported, params: [[name, type]], results: [type], locals: [[name,
// type]], code }] }, each type as written (i32, ref:big...), for the back end to make its own.
export function parseRuntime(text = RUNTIME) {
  const memories = [];
  const doubles = new Map();
  const globals = [];
  const funcs = [];
  for (const line of text.split("\n")) {
    const words = line.split(" ");
    const word = words[0];
    if (word === "memory") {
      memories.push({ name: words[1], pages: Number(words[2]) });
    } else if (word === "double") {
      doubles.set(words[1], new DataView(Uint8Array.from(words.slice(2).map(Number)).buffer).getFloat64(0, true));
    } else if (word === "global") {
      globals.push({ name: words[1], type: words[2], mutable: words[3] === "mut", init: words.slice(4).join(" ") });
    } else if (word === "func" || word === "export") {
      const arrow = words.indexOf("->");
      const params = words.slice(2, arrow).map((p) => {
        const colon = p.indexOf(":");
        return [p.slice(0, colon), p.slice(colon + 1)];
      });
      funcs.push({ name: words[1], exported: word === "export", params, results: words.slice(arrow + 1), locals: [], code: "" });
    } else if (word === "local") {
      funcs.at(-1).locals.push([words[1], words[2]]);
    } else {
      funcs.at(-1).code = words.slice(1).join(" ");
    }
  }
  return { memories, doubles, globals, funcs };
}
