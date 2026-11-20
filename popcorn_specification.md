# PopCorn 言語仕様

PopCorn 1

この文書は PopCorn 1 の公開仕様です。処理名、型名、演算子名、コード例は英語表記を使いますが、説明文はすべて日本語で書いています。

この文書で「返す」と書いたときは、処理結果を次のパイプ段階へ渡すことを意味します。「エラー」と書いたときは、その時点で通常の実行を止めて PopCorn エラーを出すことを意味します。コード例は、特にことわりがない限りそのまま動かせます。

## 1. 基本方針

PopCorn は、値を `>>` で次の処理へ渡していくデータフロー言語です。値の加工は非破壊的で、元のリストや辞書を書き換えません。画面表示やファイル操作など外部へ作用する処理は、値の加工とは分けて扱います。

改行には構文上の意味がありません。空白・改行・インデントは読みやすさのために自由に使えます。ふつうの文は `.` で終え、ブロックは `{` で開いて `}` で閉じます。ブロック `{ ... }` で終わる文の末尾（`Map { ... }` や `pop 関数名 { ... }` など）と、ブロック `{ ... }` 内の最後に書かれた文（1文だけの場合を含む）では、文末の `.` を省略できます。

### 言語の分類と特徴

PopCorn 1 は、次の性質を組み合わせたデータフロー言語です。

| 分類軸 | PopCorn 1 の性質 |
|---|---|
| パラダイム | データフロー型 ＋ 関数型寄り（`Loop`・`Break`・`Return` などの手続き型要素も備える） |
| データの扱い | 非破壊（イミュータブル）中心。クラスやオブジェクト指向・ドット記法を持たない |
| 型システム | 強い動的型付け（型注釈は不要だが、暗黙の真偽値変換などは禁止） |
| 評価とスコープ | 先行評価（`and`/`or` は短絡評価）・レキシカルスコープ |
| 構文の向き | 代入・関数定義・加工のすべてが左から右（`>>`）に統一 |
| 主な用途 | 単一ファイル完結の API・JSON 加工、自動化スクリプト、プログラミング入門 |

```
42 >> answer.
answer >> Display.
```

`//` から行末まではコメントとして無視されます。

### ソースと字句

ソースコードは UTF-8 の文字列として読み込みます。字句解析は先頭から進み、空白・タブ・改行・コメントをトークンの区切りとして扱います。ただし文字列リテラルの中では、これらもそのまま文字の一部になります。

字句解析で認識する記号は次のとおりです。

| 分類 | 記号 |
|---|---|
| 文とブロック | `.`、`{ }` |
| パイプ | `>>` |
| グループ | `( )`、`[ ]`、`{ }` |
| 区切り | `,` |
| アクセス | `::`、`@` |
| 演算子 | `+ - * / % == != > < >= <=` |

### 評価の順序

式とパイプラインは左から右へ、必要になったタイミングで評価します。関数呼び出しや標準処理は現在値を受け取り、その結果を次の段階へ渡します。`and` と `or` だけは短絡評価を行うため、左辺だけで結果が決まるときは右辺を評価しません。

トークンの間であれば、改行・インデント・空行を増やしたり減らしたりしてもプログラムの意味は変わりません。文を区切るときは必ず `.` を使ってください。

## 2. 名前と表記

識別子には ASCII の英字・数字・`_` が使えます。先頭は英字か `_` にします（正規表現では `[A-Za-z_][A-Za-z0-9_]*` です）。大文字と小文字は区別されるため、`Map` と `map` は別の名前として共存できます。標準処理名と大文字・小文字だけが違うユーザー名には、処理系やエディタが注意を出してもかまいませんが、自動修正はしません。

標準のパイプ処理と型変換処理は、先頭を大文字にしたキャメルケースで書きます。

```
Map  Filter  Reduce  Sort  SortDesc  Group  Fork  Update  Check  Loop  Try  Catch
Break  Return  Zip  Bool  Str  List  Dict  Num  Type
```

次の語は小文字の予約語です。

```
when  else  as  pop  true  false  null  and  or  not  in
```

予約語になるのは、上と完全に同じ綴りだけです。

名前の役割は書き方から見分けられます。

| 表記 | 役割 | 例 |
|---|---|---|
| 先頭が小文字または `_` | 値の名前、引数、別名、ラベル | `score`、`user_name`、`_temporary` |
| 先頭が大文字 | 標準処理またはユーザー関数 | `Map`、`AddTwo` |
| `@` | 現在値 | `@ * 2` |

## 3. 値と型

PopCorn では次の型を扱います。

| 型 | 表記例 | 内部仕様 |
|---|---|---|
| `Null` | `null` | 値がないことを表す単一の値 |
| `Bool` | `true`、`false` | 真偽値 |
| `Num` | `42`、`3.14` | IEEE 754 倍精度浮動小数点数（`NaN`・`Infinity` になる演算は `RuntimeError`）。添字や回数には小数部のない整数値を使います |
| `Str` | `"PopCorn"`、`'PopCorn'` | Unicode コードポイント列 |
| `List` | `[1, 2, 3]` | 順序付き配列（添字は 0 から始まります） |
| `Dict` | `{"name": "PopCorn"}` | 挿入順を保つ連想配列（キーは `Str`） |
| 値リスト（`Tuple`） | `(first, second)` | 複数引数の受け渡しや分解束縛に使う固定長タプル |

### 値リストと `List` の違い

`(first, second)` は、実行時に `List` とは区別される値リスト（内部型 `Tuple`）です。複数の値をまとめて関数や標準処理へ渡すときや、分解束縛するときに使います。

* 関数・標準処理へ複数引数として展開されるのは**値リスト `(...)` だけ**です。
* ふつうの `List`（`[10, 20]`）を関数へ渡したときは展開されず、1 個の `List` 引数としてそのまま渡ります。
* 値リストに `List` 変換を使うと、同じ順番の `List` になります。`Type` を使うと `"Tuple"` を返します。

### リテラル

```
Digit          = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" .
NumLiteral     = Digit { Digit } [ "." Digit { Digit } ] .
BoolLiteral    = "true" | "false" .
NullLiteral    = "null" .
ListLiteral    = "[" [ Expression { "," Expression } [ "," ] ] "]" .
DictLiteral    = "{" [ StrLiteral ":" Expression
                 { "," StrLiteral ":" Expression } [ "," ] ] "}" .
ValueList      = "(" Expression "," Expression
                 { "," Expression } [ "," ] ")" .
StrLiteral     = InterpString | PlainString | RawString .
InterpString   = '"' { Char | Escape | "{{" | "}}" | "{" Expression "}" } '"' .
PlainString    = "'" { Char | Escape } "'" .
RawString      = "`" { Char } "`" .      (* 同じ行の中で閉じる。` そのものは入れられない *)
```

負の数は、数値リテラルに単項演算子 `-` を付けた式として評価します。

```
-42 >> negative.
[1, 2, 3] >> numbers.
{"name": "Ada", "active": true} >> user.
```

`Dict` のキーは `Str` です。`value::field` という書き方は、`Str` キー `"field"` を取り出す短縮表記です。

### 等価性

`==` は型と中身を比べます。`1` と `1.0` はどちらも同じ `Num` の値なので `1 == 1.0` は `true` です。一方で `Bool` は数値と区別するため、`true == 1` は `false` です。`List` と値リストは、同じ型・同じ長さで、すべての位置の値が等しいときに等しくなります。`Dict` は挿入順に関係なく、同じキーを持ち、それぞれの値が等しいときに等しくなります。比較結果は `Bool` です。

### `Type` と型変換

`Type` は次のいずれかの `Str` を返します。

```
Null  Bool  Num  Str  List  Dict  Tuple
```

標準の型処理は次のとおりです。

| 処理 | 意味 |
|---|---|
| `Num` | 変換できる値を数値（`Num`）にします |
| `Str` | 値を規定の形式の文字列（`Str`）にします |
| `List` | `List` はそのまま返し、値リスト（`Tuple`）は `List` に変換します。それ以外は `TypeError` |
| `Dict` | 値が `Dict` であることを確かめてそのまま返します。それ以外は `TypeError` |
| `Type` | PopCorn の型名を返します |
| `Bool` | 厳格なルールで `Bool` に変換します |

`Num` は、`Num` をそのまま返し、10進数を表す `Str` を `Num` へ変換します。`Bool` は `Num` の入力には使えません。

`Bool` が受け付けるのは `true`、`false`、数値の `1`、数値の `0` だけです。`1` は `true`、`0` は `false` になります。それ以外の値（`"false"` や `2` など）を渡すと `TypeError` になります。

```
1 >> Bool.        // true
0 >> Bool.        // false
```

### `Str` 変換の出力ルール

どの処理系でも同じ結果になるよう、`Str` 変換と文字列補間 `{式}` の出力形式を次のように決めています。

| 入力型 | `Str` 変換結果の例 | ルール |
|---|---|---|
| `Null` | `"null"` | 固定文字列 `"null"` |
| `Bool` | `"true"` / `"false"` | 固定文字列 |
| `Num` | `"42"`、`"3.14"` | 小数部がない整数値は `"42"` のように小数点なしで表記し、小数は最短の10進表記にします |
| `Str` | そのまま | 元の文字列をそのまま返します |
| `List` | `"[1, 2, 3]"` | JSON 互換表記（要素の間は `, `） |
| `Dict` | `'{"name": "Ada"}'` | JSON 互換表記（挿入順を保ち、`: ` と `, ` で区切ります） |
| 値リスト | `"(1, 2)"` | 丸括弧表記（要素の間は `, `） |

### 標準関数一覧

標準関数は、左のパイプから現在値を受け取り、結果を次の段階へ渡します。複数入力をとる関数は、値リスト `(a, b) >> Func` でも、パイプ追加引数 `a >> Func(b)` でも呼び出せます（詳しくは第4節を見てください）。

表の「非破壊」は、渡された `List`・`Dict`・`Str` を変えずに新しい値を返すことを表します。「外部効果」は、画面・時間・入出力・ネットワーク・ファイルへ働きかける処理です。入力の形や型が合わない場合は、特記がない限り `TypeError` になります。

| 分類 | 処理 | 入力 | 結果とルール |
|---|---|---|---|
| 型 | `Type` | 任意の値 | PopCorn の型名を返します。 |
| 型 | `Num` | 数値に変換できる値 | `Num` を返します。変換できない場合は `TypeError`。 |
| 型 | `Str` | 任意の値 | 規定の文字列表現を返します。 |
| 型 | `List` | `List` または値リスト | `List` を返します。それ以外は `TypeError`。 |
| 型 | `Dict` | `Dict` | 同じ `Dict` を返します。`Dict` 以外は `TypeError`。 |
| 型 | `Bool` | `true`、`false`、`0`、`1` | 厳格な `Bool` 変換を行います。それ以外は `TypeError`。 |
| ストリーム | `Map` | `List` と要素用ブロック | 各要素にブロックを適用した新しい `List` を返します。 |
| ストリーム | `Filter` | `List` と `Bool` 用ブロック | ブロックが `true` を返した要素だけを集めた新しい `List` を返します。 |
| ストリーム | `Reduce` | `List`、任意の初期値、集約用ブロック | 初期値があれば空 `List` で初期値を返します。初期値がなければ先頭要素を初期値とし、空 `List` は `RuntimeError`。 |
| ストリーム | `Sort` | `List` とキー用ブロック | キーを使って昇順で安定ソートした新しい `List` を返します。 |
| ストリーム | `SortDesc` | `List` とキー用ブロック | キーを使って降順で安定ソートした新しい `List` を返します。 |
| ストリーム | `Group` | `List` と `Str` キー用ブロック | キーごとの `List` をまとめた `Dict` を返します。 |
| ストリーム | `Fork` | 任意の値と複数の分岐 | ラベルなしなら宣言順の `List`、ラベル付きなら `Dict` を返します。 |
| ストリーム | `Update` | `Dict` と更新用ブロック | 指定フィールドを更新した新しい `Dict` を返します。 |
| ストリーム | `Check` | 任意の値と `when` / `else` 分岐 | 最初に `true` になった分岐の値を返します。 |
| ストリーム | `Loop` | 任意の状態値と反復用ブロック | `Break` まで状態値を更新し続け、`Break` に渡した値を返します。 |
| ストリーム | `Try` / `Catch` | 任意の値と本体・捕捉ブロック | 本体でエラーが起きたとき、`Catch` で受け取って回復値を返します。 |
| 数値 | `Add` | `(left, right)` | 2つの値を `+` で足すか連結します。 |
| 数値 | `Div` | `(left, right)` | 2つの整数値（小数部のない `Num`）を 0 の方向へ切り捨てて整数除算した `Num` を返します。0 除算は `RuntimeError`。 |
| 数値 | `Sum` | 数値だけの `List` | 合計を返します。空 `List` は `0`。 |
| 数値 | `Average` | 数値だけの空でない `List` | 平均を `Num` で返します。空 `List` は `RuntimeError`。 |
| 数値 | `Max` | 比較できる値の空でない `List` | 最大値を返します。空 `List` は `RuntimeError`。 |
| 数値 | `Min` | 比較できる値の空でない `List` | 最小値を返します。空 `List` は `RuntimeError`。 |
| 数値 | `Round` | `Num` | いちばん近い整数値の `Num` を返します。中間値（`.5`）は 0 から遠い方向へ丸めます（四捨五入）。 |
| 数値 | `Abs` | `Num` | 絶対値の `Num` を返します。 |
| 数値 | `Random` | `(minimum, maximum)` の 2つの整数値（`Num`） | 両端を含む範囲からランダムな整数値の `Num` を返します。`minimum > maximum` は `RuntimeError`。外部効果あり。 |
| 数値 | `Range` | `(start, end)` の 2つの整数値（`Num`） | `start` から `end` まで（両端を含む）の `Num` の `List` を返します。`start > end` なら空 `List` `[]`。 |
| 文字列 | `Uppercase` | `Str` | 大文字にした新しい `Str` を返します。非破壊。 |
| 文字列 | `Lowercase` | `Str` | 小文字にした新しい `Str` を返します。非破壊。 |
| 文字列 | `Split` | `(text, delimiter)` | 区切り文字で分けた `Str` の `List` を返します。 |
| 文字列 | `Replace` | `(text, old, new)` | 置換後の新しい `Str` を返します。非破壊。 |
| 文字列 | `Join` | `(items, delimiter)` | `List` の各要素を `Str` 変換してつないだ `Str` を返します。 |
| 文字列 | `Format` | `(template, value, ...)` | `{0}`、`{1}` などの位置プレースホルダに値を埋め込んだ `Str` を返します。ふだんは `{式}` 補間を使うのがおすすめです。 |
| コレクション | `Length` | `List`、`Dict`、`Str`、値リスト | 要素数、キー数、または Unicode コードポイント数を `Num` で返します。 |
| コレクション | `Reverse` | `List` または `Str` | 逆順にした新しい `List` または `Str`（コードポイント単位）を返します。非破壊。 |
| コレクション | `Get` | `(target, key)` または `(target, key, default)` | `List` の添字や `Dict` のキーに対応する値を返します。見つからないとき、`default` があればそれを返し、なければ `IndexError` / `KeyError`。 |
| コレクション | `Set` | `(target, key, value)` | `List` の要素や `Dict` のフィールドを置き換えた新しい値を返します。非破壊。 |
| コレクション | `Remove` | `(dict, key)` | 指定キーを取り除いた新しい `Dict` を返します。存在しないキーでもエラーにならず複製を返します。非破壊。 |
| コレクション | `Keys` | `Dict` | 挿入順のキー（`Str`）の `List` を返します。 |
| コレクション | `Values` | `Dict` | 挿入順の値の `List` を返します。 |
| コレクション | `Entries` | `Dict` | 挿入順の `[key, value]` の `List` を返します。 |
| コレクション | `Merge` | `(left, right)` | 2つの `Dict` を左から右へ合わせた新しい `Dict` を返します。同じキーは右側が優先されます。 |
| コレクション | `Contains` | `(target, item)` | `List` の要素、`Dict` の `Str` キー、`Str` の部分文字列を探して `Bool` を返します。 |
| コレクション | `Append` | `(items, item)` | `item` を末尾に追加した新しい `List` を返します。非破壊。 |
| コレクション | `Slice` | `(target, end)` または `(target, start, end)` | 範囲を切り出した新しい `List` または `Str`（コードポイント単位）を返します。終端 `end` は含みません。負の添字・`start > end`・範囲外は `IndexError`。 |
| コレクション | `Array` | 非負の整数値（`Num`）の `size` またはサイズの `List` | 指定した各次元を `0` で埋めた新しい `List` を返します。 |
| コレクション | `Zip` | 空でない `List` 群（値リスト） | 同じ位置の要素どうしを `List` にまとめた `List` を返します。いちばん短い入力の長さで止まります。 |
| JSON | `ToJson` | JSON にできる値 | JSON 文字列を返します。 |
| JSON | `FromJson` | JSON 文字列 | JSON を PopCorn の値に変換します。壊れた JSON は `RuntimeError`。 |
| 時間 | `Now` | 任意の値 | 現在日時を `year`・`month`・`day`・`hour`・`minute`・`second` を持つ `Dict` で返します。外部効果あり。 |
| 時間 | `Sleep` | 秒数を表す `Num` | 指定した秒数だけ待ってから、入力値をそのまま返します。負の値は `RuntimeError`。外部効果あり。 |
| 入出力 | `Display` | 任意の値 | 値を `Str` 変換して表示し、元の値をそのまま返します。外部効果あり。 |
| 入出力 | `Input` | 表示するプロンプト（`Str`） | ユーザーが入力した `Str` を返します。外部効果あり。 |
| 入出力 | `Debug` | 任意の値 | デバッグ用に型と値を表示し、元の値をそのまま返します。外部効果あり。 |
| 入出力 | `ReadFile` | ファイルパスを表す `Str` | ローカルファイルの中身を UTF-8 の `Str` で返します。失敗時は `IOError`。外部効果あり。 |
| 入出力 | `WriteFile` | `(content, path)` | 内容をファイルへ書き込み、`content` をそのまま返します。失敗時は `IOError`。外部効果あり。 |
| 入出力 | `Fetch` | URL を表す `Str` | HTTP GET の応答本文を `Str` で返します。通信失敗や 4xx/5xx は `NetworkError`。外部効果あり。 |
| 入出力 | `PostFetch` | `(body, url)` または `(body, url, headers)` | HTTP POST を送り、応答本文を `Str` で返します。`headers` を省くと `{}` になります。通信失敗や 4xx/5xx は `NetworkError`。外部効果あり。 |
| 入出力 | `HttpRequest` | `(method, url, headers, body)` | 任意の HTTP リクエストを送り、`{"status": Num, "headers": Dict, "body": Str}` を返します。通信できないときだけ `NetworkError`。外部効果あり。 |
| 制御 | `Return` | 任意の値 | いちばん内側の `pop` 関数を終わらせ、入力値を関数の結果にします。関数外では `RuntimeError`。 |
| 制御 | `Break` | 任意の値 | いちばん内側の `Loop` を終わらせ、入力値を `Loop` の結果にします。`Loop` 外では `RuntimeError`。 |
| エラー | `Throw` | 任意の値 | 入力値を `Str` 変換したメッセージで `UserError` を起こします。 |

## 4. パイプライン、束縛、パイプ追加引数

`>>` は左の値を右の処理へ渡す基本の演算子です。文の終わりに小文字の名前を書くと、現在値にその名前を付けます（束縛）。束縛したあとも、その段階の結果は現在値のままです。

```
[1, 2, 3] >> Max >> largest.
largest >> Display.
```

複数の値をまとめて渡すときは、値リストを使います。

```
(10, 20) >> values.
```

複数の名前へ一気に分ける（分解束縛）ときは `>> (left, right)` と書きます。右側の名前の数と、現在値（値リストまたは `List`）の要素数は同じにする必要があります。数が合わないと `RuntimeError` です。

### パイプ追加引数（糖衣構文）

複数の入力をとる標準関数やユーザー関数は、`>>` の右側に補助引数を丸括弧で添えて呼び出せます。

```
x >> Func(y, z)
```

これは、次の値リストを使った呼び出しとまったく同じ意味になります。

```
(x, y, z) >> Func
```

この書き方を使うと、パイプラインを途中で切らずに複数引数の関数をつなげられます。

```
"a,b,c" >> Split(",") >> Join("-") >> Uppercase >> text.
{"name": "Ada"} >> Get("nickname", "名無し") >> name.
{"ok": true} >> ToJson >> PostFetch("https://example.com/api") >> response.
```

**注意点:** `Func(x, y)` のように `>>` なしで関数だけを単独で呼ぶことはできません（`SyntaxError` になります）。関数のメインの入力は、いつも左側のパイプから渡します。

### 条件付き実行（後置 `when`）

文の末尾（`.` の直前）に `when 条件式` を添えると、条件が `true` のときだけその文を実行します。`false` のときはその文をスキップします（条件が `Bool` 以外の場合は `TypeError`）。`Loop` からの `Break` や関数からの `Return` を 1 行で書きたいときに便利です。

```
items >> Return when (items >> Length) <= 1.
arr >> Break when i >= n - 1.
```

### 構文記法（EBNF）

以下の構文ルールでは、`=` の左側が構文要素の名前、引用符の中がソースにそのまま書く文字、`|` が選択、`[ ]` が省略可能、`{ }` が 0 回以上の繰り返しを表します。

```
Program            = { TopLevelStatement } .
TopLevelStatement  = FunctionDefinition | Statement .
Statement          = Pipeline [ "when" Expression ] "." | BlockTerminatedPipeline .
BlockTailStatement = Pipeline [ "when" Expression ] [ "." ] | BlockTerminatedPipeline .
Block              = { Statement } [ BlockTailStatement ] .

Pipeline           = Expression { ">>" PipelineStage } .
PipelineStage      = ProcessCall | Binding | StreamBlock .
ProcessCall        = ProcessName [ "(" ArgumentList ")" ] .
ArgumentList       = Expression { "," Expression } [ "," ] .
Binding            = VariableName | "(" VariableName "," VariableName
                     { "," VariableName } ")" .

BlockTerminatedPipeline = Expression { ">>" PipelineStage } ">>" StreamBlock .

StreamBlock        = SimpleStreamBlock
                   | ReduceBlock
                   | ForkBlock
                   | UpdateBlock
                   | CheckBlock
                   | TryBlock .

AliasClause        = "as" ( VariableName
                     | "(" VariableName "," VariableName { "," VariableName } ")" ) .

SimpleStreamBlock  = SimpleStreamName [ AliasClause ] "{" Block "}" .
SimpleStreamName   = "Map" | "Filter" | "Sort" | "SortDesc" | "Group" | "Loop" .

ReduceBlock        = "Reduce" [ "(" Expression ")" ] [ AliasClause ] "{" Block "}" .

ForkBlock          = "Fork" [ AliasClause ] "{" ( ForkListBody | ForkDictBody ) "}" .
ForkListBody       = { Statement } BlockTailStatement .
ForkDictBody       = { ForkEntry } ForkTailEntry .
ForkEntry          = VariableName ":" Statement .
ForkTailEntry      = VariableName ":" BlockTailStatement .

UpdateBlock        = "Update" [ AliasClause ] "{" { UpdateStatement } [ UpdateTailStatement ] "}" .
UpdateStatement    = Expression { ">>" PipelineStage } ">>" FieldTarget "." .
UpdateTailStatement = Expression { ">>" PipelineStage } ">>" FieldTarget [ "." ] .
FieldTarget        = ( VariableName | "@" ) "::" Identifier .

CheckBlock         = "Check" [ AliasClause ] "{"
                     WhenBranch { WhenBranch } ElseBranch "}" .
WhenBranch         = "when" Expression "{" Block "}" .
ElseBranch         = "else" "{" Block "}" .

TryBlock           = "Try" [ AliasClause ] "{" Block "}"
                     "Catch" [ AliasClause ] "{" Block "}" .

FunctionDefinition = [ ParameterList ">>" ] "pop" ProcessName "{"
                     Block "}" .
ParameterList      = "(" VariableName { "," VariableName } ")" .

Expression         = OrExpr .
OrExpr             = AndExpr { "or" AndExpr } .
AndExpr            = CompareExpr { "and" CompareExpr } .
CompareExpr        = AddExpr [ ( "==" | "!=" | ">" | "<" | ">=" | "<=" | "in" ) AddExpr ] .
AddExpr            = MulExpr { ( "+" | "-" ) MulExpr } .
MulExpr            = UnaryExpr { ( "*" | "/" | "%" ) UnaryExpr } .
UnaryExpr          = ( "-" | "not" ) UnaryExpr | PostfixExpr .
PostfixExpr        = PrimaryExpr { "[" Expression "]" | "::" Identifier } .
PrimaryExpr        = Literal | VariableName | "@"
                   | "(" Pipeline ")" | ValueList | ListLiteral | DictLiteral .
```

* `FunctionDefinition` は `TopLevelStatement` にだけ入っているため、ブロックや関数の中に関数定義は書けません。
* ブロック `{ ... }` で終わる文の末尾（`Map { ... }` や `pop 関数名 { ... }` など）と、ブロック `{ ... }` 内の最後に書かれた文（1文だけの場合を含む）では、文末の `.` を省略できます。
* `BlockTerminatedPipeline` の `}` のすぐあとに `>>` が続くときは、外側のパイプラインがそのまま続き、最後が `StreamBlock` でなければ `.` で閉じます。
* `PrimaryExpr` に `"(" Pipeline ")"` があるため、式の途中でも丸括弧で囲んでパイプラインを使えます（例: `([1, 2] >> Length) + 1`）。

### パイプラインの評価

パイプラインでは、まず最初の式を評価して現在値にします。続く各段階では現在値を入力として 1 回ずつ処理し、その結果で現在値を置き換えていきます。最後の現在値が、パイプライン全体の結果になります。

```
-5 >> Abs >> result.
```

上の文では `-5` → `Abs` → `result` の順に評価します。`result` には `5` が入り、文全体の結果も `5` です。

## 5. 現在値、別名、アクセス、スコープ

`@` は現在のパイプ値を表します。プログラムのいちばん最初では `@` は `null` です。

### 文をまたいだときの `@` の動き

ブロックや関数本体の中では、`@` はそのブロックや関数が受け取った**入力値**を覚えています。

* 1つのパイプラインの途中では、段階ごとの結果が次の段階の入力として渡されます。
* 新しい文（パイプライン）の先頭では、`@` はもう一度そのブロックや関数の入力値を指します。

### 別名（`as`）

ストリームブロックでは、`as` を使って現在値にわかりやすい別名を付けられます。

```
[1, 2, 3] >> Map as value {
    value * 2.
} >> doubled.
```

`Reduce` や `Loop` のように値リストや `List` が流れてくるブロックでは、`as (a, b)` で分解して名前を付けられます。別名はブロックの中だけで有効なので、外側に同じ名前があっても上書きしません。

### アクセス

リストの要素は `value[index]`、辞書のフィールドは `value::field` で取り出せます。

```
[10, 20] >> values.
{"name": "Ada"} >> user.
values[0] >> first.
user::name >> name.
```

存在する添字やキーを指定すると、その値が返ります。`List` の範囲外の添字は `IndexError`、添字の型違いは `TypeError`、存在しない `Dict` キーは `KeyError` になります。

### スコープと束縛

プログラムのいちばん外側はグローバル（大域）スコープです。関数呼び出し、ストリームブロックの各評価、`Check` の各分岐、`Loop` の各反復、`Try`/`Catch` の各ブロックは、それぞれローカルスコープを作ります。名前を探すときは、現在のスコープから外側へ向かって探します。

パイプラインの最後で束縛すると、現在のスコープに名前が作られます。同じスコープに同じ名前がすでにあれば、新しい値に結び直します。内側のスコープで束縛しても、外側の同じ名前には影響しません。

## 6. 式、`Bool`、演算子

二項演算子は次のとおりです。

```
+  -  *  /  %
==  !=  >  <  >=  <=  in
and  or
```

単項演算子は `-` と `not` です。

| 優先順位 | 演算子 | 結合方向 | 入力と結果 |
|---|---|---|---|
| 1 | `(式)` / `(パイプライン)` | — | 内側を先に評価します |
| 2 | `-`、`not` | 右 | 数値の符号反転、`Bool` の否定 |
| 3 | `*`、`/`、`%` | 左 | 数値の乗算、除算、剰余 |
| 4 | `+`、`-` | 左 | 数値演算、同じ型のコレクションの連結、数値の減算 |
| 5 | `==`、`!=`、`>`、`<`、`>=`、`<=`、`in` | 非結合 | 比較・含有判定の `Bool` |
| 6 | `and` | 左 | `Bool` の論理積（短絡評価） |
| 7 | `or` | 左 | `Bool` の論理和（短絡評価） |

### 数値演算の型ルール

* 数値演算（`+`、`-`、`*`、`/`、`%`）はすべて `Num` を入力とし、`Num` を返します。
* 整数どうしの割り算（小数点以下切り捨て）をしたいときは標準関数 `Div` を使います（例: `7 >> Div(2)` は `3`）。
* `0` での割り算（`/`、`Div`）と剰余（`%`）は `RuntimeError` です。
* `+` は数値の足し算だけでなく、`Str` どうしや `List` どうしの連結にも使えます。連結結果は新しい値として作られます。

### 剰余（`%`）の符号

`a % b` の結果の符号は、割られる数 `a` と同じです（C や JavaScript と同じ方式です）。`Div` が `0` の方向へ切り捨てるので、`a` が整数のとき、`(a, b) >> Div` に `b` を掛けて `a % b` を足すと、いつでも `a` に戻ります。

| 式 | 結果 |
|---|---|
| `7 % 3` | `1` |
| `-7 % 3` | `-1` |
| `7 % -3` | `1` |
| `-7 % -3` | `-1` |

負の数では結果が負になります（Python とは違います）。次の書き方をおすすめします。

* 奇数かどうかは、`n % 2 == 1` ではなく `n % 2 != 0` で調べます（`-3 % 2` は `-1` です）。
* `0` 以上に収めたいとき（ぐるぐる回る添字など）は、`((i % n) + n) % n` と書きます。

### 比較と `in` 演算子

大小比較（`>`、`<`、`>=`、`<=`）は数値どうし、または `Str` どうし（Unicode コードポイント順）で使えます。比べられない型の組み合わせは `TypeError` です。

`item in target` は `target >> Contains(item)` と同じ意味です。`List` の要素、`Dict` の `Str` キー、`Str` の部分文字列が含まれるかを調べて `Bool` を返します。

### 厳格な `Bool` ルール

`Filter` の結果、`Check` の `when` 条件、`and`、`or`、`not` が受け付けるのは `Bool` だけです。数値・文字列・リスト・辞書・`null` を暗黙に `true`/`false` として扱うことはできません。`Bool` 以外を渡すと `TypeError` になります。

```
5 >> value.
value > 0 and value < 10 >> valid.
value in [1, 3, 5] >> matched.
```

## 7. 文字列（3種類）と補間

`Str` リテラルには、3種類の書き方があります。用途で使い分けます。

| 種類 | 書き方 | `{式}` の補間 | `\` のエスケープ | 主な使い道 |
|---|---|---|---|---|
| 補間文字列 | `"…"` | あり | あり | ふつうの文字列。変数や式を埋め込むとき。文字としての `{` `}` を `{{` `}}` と書けるのは、この種類だけです |
| プレーン文字列 | `'…'` | なし | あり | JSON やテンプレートなど、`{` `}` をそのまま書きたいとき |
| 生（raw）文字列 | `` `…` `` | なし | なし | ファイルパスや正規表現など、`\` も `{ }` も、一切加工したくないとき |

### 補間文字列（`"…"`）

`\` はエスケープの合図です。

| 表記 | 文字 |
|---|---|
| `\n` | 改行 |
| `\t` | タブ |
| `\\` | バックスラッシュ |
| `\"` | 二重引用符 |
| `\'` | 単引用符 |

文字列の中に `{式}`（または丸括弧を含む `{パイプライン}`）を書くと、その場で評価した結果を第3節の `Str` 変換ルールで文字列にして埋め込みます。補間式では、その文字列がある場所の現在値と字句スコープがそのまま使えます。

文字としての `{` は `{{`、`}` は `}}` と書きます。補間式の中に辞書リテラル `{...}` のような波括弧が出てきても、字句解析器が波括弧の入れ子と中の文字列リテラルを追跡して、正しい閉じ `}` を見つけます。

```
"Ada" >> person.
"Hello, {person}!" >> greeting.
"{{user}} = {person}\n" >> line.
```

補間式の中で構文エラーや未定義名、評価エラーが起きた場合は、PopCorn エラーになります。

### プレーン文字列（`'…'`）

`'…'` では、`{` と `}` は、ただの文字です。補間はされません。`\n`、`\t`、`\\`、`\'` などのエスケープは、補間文字列と同じように使えます。`{{` も、2つの波括弧のままです。

```
'{"name": "Ada"}' >> json.      // {"name": "Ada"}
'Hello {name}' >> text.         // Hello {name}（補間されません）
'it\'s' >> word.                // it's
```

`'…{name}…'` のように、`{識別子}` の形が入っていると、「補間されません。値を入れたいときは `"…"` を使います」という注意（警告）を、診断に出します。プログラムは、そのまま実行できます。`{{name}}` のように波括弧を二重にしたものは、テンプレートとして、わざと書くことがあるので、注意の対象にしません。

### 生文字列（`` `…` ``）

`` `…` `` の中は、書いたとおりの文字になります。`\` はエスケープになりません。`{ }` は補間されません。

```
`C:\Users\ada\new` >> path.     // C:\Users\ada\new
`\d+\.\d{2}` >> pattern.        // \d+\.\d{2}
```

* 同じ行の中で閉じます。行をまたぐと、「文字列が閉じられていません」というエラーです。
* バッククォートそのものは、中に入れられません。入れたいときは、`"`" や `'`'` のように、ほかの種類の文字列で書きます。

## 8. 標準ストリーム処理

ストリーム処理は、処理名、任意の引数や `as` 別名、`{`、本体、`}` の順に書きます。別名を省いたときは本体の中で `@` を使います。本体は上から順に評価され、最後の文の結果がブロック全体の結果になります。空の本体は、受け取った現在値をそのまま返します。短い処理なら 1 行でも書けます。

```
[1, 2, 3] >> Map as x { x * 2. } >> doubled.
```

### `Map`

`Map` は `List` の各要素を順番に変換し、同じ長さの新しい `List` を返します。

```
[1, 2, 3] >> Map as value {
    value * 2.
} >> doubled.
```

### `Filter`

`Filter` は、ブロックが `Bool` の `true` を返した要素だけを残します。

```
[1, 2, 3, 4] >> Filter as value {
    value % 2 == 0.
} >> evens.
```

### `Reduce`

`Reduce` は `List` を 1 つの値にまとめます。初期値を `Reduce(initial)` で渡せます。各反復では `(accumulator, item)` の値リストが流れてくるので、`as (acc, item)` でそのまま受け取れます。

* 初期値を指定したとき、空 `List` ならブロックを実行せず初期値をそのまま返します。
* 初期値を省いたときは先頭要素が初期 `accumulator` になり、空 `List` は `RuntimeError` です。

```
[1, 2, 3, 4] >> Reduce(0) as (acc, item) {
    acc + item.
} >> total.

// 初期値を省略する書き方
[1, 2, 3, 4] >> Reduce as (acc, item) {
    acc + item.
} >> total2.
```

### `Sort` と `SortDesc`

`Sort` はブロックが返すキーで昇順に、`SortDesc` は降順に安定ソートした新しい `List` を返します。キーは数値どうし、または `Str` どうしなど比較できる値である必要があり、比べられない場合は `RuntimeError` です。

```
[
    {"name": "Ada", "score": 20},
    {"name": "Bob", "score": 10}
] >> users.

users >> SortDesc as user {
    user::score.
} >> by_score.

users >> SortDesc as user {
    user::name.
} >> by_name_desc.
```

### `Group`

`Group` はブロックが返す `Str` をキーにして、値を `Dict` に分類します。各グループ内の並び順と、キーが最初に現れた順番をどちらも保ちます。

```
[
    {"team": "red", "name": "A"},
    {"team": "blue", "name": "B"},
    {"team": "red", "name": "C"}
] >> Group as member {
    member::team.
} >> by_team.
```

### `Fork`

`Fork` は同じ入力に対して複数の分岐を実行します。「ラベルなし形式」と「ラベル付き形式」があり、1つの `Fork` の中で混ぜることはできません。どれか 1 つでも分岐が失敗すると、`Fork` 全体がエラーになります。

* **ラベルなし形式:** 書いた順に結果を並べた `List` を返します。
* **ラベル付き形式:** `label: Statement` の組を、書いた順の `Dict` として返します。

```
// ラベル付き形式（Dict を返します）
[1, 2, 3] >> Fork as values {
    total: values >> Sum.
    max:   values >> Max.
} >> stats.
stats::total >> Display.
```

### `Update`

`Update` は `Dict` を非破壊的に更新します。`UpdateBlock` の中では、`>>` で好きな段数のパイプラインをつないで、最後を `>> target::field.` にします。トップレベルのフィールドを追加・上書きします。書いた順に反映されるため、後ろの行から直前に更新したフィールドを参照できます。

```
{"name": "Ada", "score": 10} >> Update as user {
    15 >> user::score.
    true >> user::active.
} >> updated.
```

左辺はパイプラインでもかまいません。自分のフィールドを加工して、そのフィールドへ書き戻せます。

```
{"name": "ada", "score": 1} >> Update as user {
    user::name >> Uppercase >> user::name.
    user::score >> Add(10) >> user::score.
} >> updated.
// updated は {"name": "ADA", "score": 11}
```

更新後は新しい外側の `Dict` が作られ、触っていない入れ子の値はそのまま残ります。キーを削除したいときは `Remove` を使ってください。

## 9. `Zip`

`Zip` は空でない `List` 群を値リストまたはパイプ追加引数で受け取り、同じ位置の要素を `List` にまとめた `List` を返します。いちばん短い入力に達したところで止まります。

```
([1, 2], [10, 20]) >> Zip >> rows.
// [1, 2] >> Zip([10, 20]) >> rows. とも書けます
// rows は [[1, 10], [2, 20]]
```

## 10. `Check`

`Check` は条件によって 1 つのブロックを選ぶ標準ストリーム処理です。上から順に `when` 条件を評価し、最初に `true` になった分岐だけを実行します。`else` は必ず書きます。

すべての `when` 条件は `Bool` を返す必要があります。`Bool` 以外を返すと `TypeError` です。複数の候補に当てはまるか調べたいときは `in` 演算子が便利です。

```
2 >> Check as value {
    when value == 0 {
        "zero".
    }
    when value in [1, 2, 3] {
        "small".
    }
    when value >= 4 {
        "large".
    }
    else {
        value >> Str.
    }
} >> label.
```

分岐は、ほかのブロックと同じように、必ず `{ }` で囲みます。ブロックの最後の文の `.` は省略できるので、1行でも書けます。

```
x >> Check {
    when @ < 0 { "negative" }
    when @ == 0 { "zero" }
    else { "positive" }
} >> sign.
```

`when 条件:` のように `:` を使う古い書き方は使えません（「Check の分岐は波括弧で書きます」というエラーになります）。波括弧にしたのは、文の最後に添える後置の `when`（「条件付き実行」）と、`Check` の分岐の `when` を、はっきり区別するためです。

## 11. `Loop` と `Break`

`Loop` は状態値をくり返し更新する標準ストリーム処理です。ブロックの最後の値が、次の反復の状態になります。状態値が 1 つなら `Loop as state {`、値リストで複数持つなら `Loop as (a, b) {` と書けます。

各反復は次の順で進みます。

1. 現在の状態値を `@` と別名にセットします。
2. ブロックを評価します。
3. ブロックの結果を次の状態値にします。
4. `Break` が評価されるまで 1 に戻ります。

`Break` はいちばん内側の `Loop` を終わらせ、現在のパイプ値を `Loop` の結果にします。`Loop` の外で `Break` を使うと `RuntimeError` です。

```
(0, 0) >> Loop as (count, total) {
    total >> Break when count >= 5.
    (count + 1, total + count).
} >> result.
```

意図的な無限ループも許されます。`Loop` を入れ子にしたとき、`Break` が止めるのは常にいちばん内側の `Loop` だけです。

## 12. `Try` と `Catch`

`Try` / `Catch` は、パイプラインの途中で起きた PopCorn エラー（`SyntaxError` を除く実行時エラー全般）をキャッチして、代わりの値で回復するための標準ストリーム処理です。

* `Try` ブロックがエラーなく終われば、その結果がそのまま次のパイプ段階へ渡ります。
* `Try` ブロックの中でエラーが起きると、`Catch` ブロックへ移ります。`Catch` ブロックの現在値（および `as` 別名）には、`{"type": Str, "message": Str}` の `Dict` が渡されます。
* `Catch` ブロックの中で別のエラーが起きた場合は、外側の `Try` またはトップレベルへ伝わります。

```
"https://api.example.com/user"
    >> Try {
        @ >> Fetch >> FromJson.
    }
    Catch as err {
        err::message >> Debug.
        {"name": "guest"}.
    }
    >> user.
```

## 13. 関数と `Return`

関数はプログラムのいちばん外側（`TopLevelStatement`）で `pop` を使って定義します。関数本体の最後の値が自動的に返ります。トップレベルの関数どうしは、ファイル内の書く順番に関係なく呼び合ったり、再帰呼び出ししたりできます。

```
(left, right) >> pop AddTwo {
    left + right.
}

(10, 20) >> AddTwo >> total.
10 >> AddTwo(20) >> total2.
```

### クロージャと引数

* 関数は**定義された時点の外側環境を値で捕捉する**字句スコープを使います（あとから外側の同名変数を束縛し直しても、関数の中から見える値は変わりません）。
* 関数の引数やブロックの別名はローカルなので、外側にある同じ名前の値を書き換えません。
* 複数引数の関数には、値リスト `(a, b) >> Func` またはパイプ追加引数 `a >> Func(b)` で順番どおりに値を渡します。引数の数が合わないと `RuntimeError` です。

### `Return`

`Return` は関数の途中で早めに抜けるための標準パイプ処理です。いちばん内側の `pop` 関数をその場で終わらせ、現在のパイプ値を関数の結果にします。関数の外で使うと `RuntimeError` です。

```
(value, min, max) >> pop Clamp {
    value >> Check {
        when @ < min {
            min >> Return.
        }
        when @ > max {
            max >> Return.
        }
        else {
            @.
        }
    }
}

150 >> Clamp(0, 100) >> clamped.
```

`Break` が抜けるのはいちばん内側の `Loop`、`Return` が抜けるのはいちばん内側のユーザー関数です。

## 14. 非破壊性と外部効果

`List`・`Dict`・`Str` を加工する標準処理は、元の値を変えずに新しい値を返します。元の名前に結果をしまいたいときは、ふつうに束縛し直します。

```
[1, 2, 3] >> value.
value >> Reverse >> value.
```

`Display`、`Input`、`Debug`、`ReadFile`、`WriteFile`、`Fetch`、`PostFetch`、`HttpRequest`、`Now`、`Sleep`、`Random` のように、画面・入出力・ネットワーク・ファイル・時間・乱数へ働きかける処理は「外部効果処理」です。

外部効果処理も、特記がない限り結果の値を次のパイプ段階へ渡します。`Display` と `Debug` は表示したあとに元の値をそのまま返し、`WriteFile` は書き込んだあとに `content` をそのまま返します。

## 15. エラー

構文・名前・型・評価の失敗はすべて PopCorn エラーとして報告します。エラーには、分類、説明、わかる場合は行番号と列番号を含めます。

| 分類 | 起きる例 |
|---|---|
| `SyntaxError` | 閉じていない文字列、文末の `.` の抜け、対応しない括弧やブロックの `{` / `}` の抜け、単独の `Func(...)` 呼び出し |
| `NameError` | 未定義の変数や関数の参照 |
| `TypeError` | 標準処理・演算子・`when`/`Filter` 条件に合わない型を渡したとき |
| `IndexError` | `List` の範囲外アクセス、不正な `Slice` 範囲 |
| `KeyError` | `Dict` にないキーへのアクセス（デフォルト値なしの `Get` や `::`） |
| `RuntimeError` | 0 除算、`NaN`/`Infinity`、比較できない `Sort` キー、`Loop` 外の `Break`、関数外の `Return`、壊れた JSON |
| `IOError` | `ReadFile` / `WriteFile` の失敗 |
| `NetworkError` | `Fetch` / `PostFetch` / `HttpRequest` の通信失敗や HTTP エラー |
| `UserError` | `Throw` を評価したとき |

エラーが起きたパイプラインでは、そのあとの段階は評価しません。`Fork` の分岐や、`Map`・`Filter`・`Reduce`・`Sort`・`SortDesc`・`Group` の中でエラーが起きた場合も、いちばん内側の `Try`/`Catch` で捕捉されない限り、そのストリーム処理全体のエラーになります。

## 16. 実装適合性

PopCorn 1 に適合する処理系は、この文書で決めたソースコードを同じ評価順序・値・スコープ・`Str` 変換表現・標準処理の結果・エラー分類で動かします。日時・乱数・入力・ファイル・ネットワークなど実行環境に左右される具体的な値まで一致させる必要はありませんが、入力の形・結果の型・エラー分類はこの仕様に合わせます。

エディタや静的解析器は、実行結果を変えない範囲で注意を表示できます。大文字・小文字だけが標準処理名と違うユーザー名に注意を出すことはできますが、正しいプログラムとして扱います。

## 付録 A. PopCorn 1 の非目標と推奨スタイル

### PopCorn 1 の非目標（Non-goals）

PopCorn 1 は、1 つのファイルで気軽に書けるデータ加工スクリプトを主な用途としています。そのため、次の機能はあえて対象外にしています（将来版での拡張余地として残しています）。

* モジュール分割や外部ファイル読み込み構文（`import` / `Use` など）
* 第一級関数（無名関数リテラルや、関数を変数・`List` に入れる機能）

### 推奨スタイルガイド

* **ブロック `{ }` の書き分け:** 1文だけの短い処理は `[1, 2, 3] >> Map as x { x * 2. }` のように 1 行で書き、複数行になるときは閉じ `}` を単独行か `} >> 次段階.` の行頭に揃えると見やすくなります。
* **対等なペア引数の書き方:** `Random` の `(minimum, maximum)` や `Zip` の複数 `List` のように、引数が対等な関数は `(1, 6) >> Random` のように値リストで渡すのがおすすめです。
* **長いパイプラインの改行:** 3 段階以上つながるパイプラインは、`>>` の前で改行して縦に揃えると読みやすくなります。

## 付録 B. 参考にした仕様書の構成

この仕様書の構成と記法は、字句要素・構文記法・式の評価順序・スコープ・エラーを分けて定義する次の公式資料を参考にしています。PopCorn のルールはこの文書だけで完結しており、参照先の言語ルールは取り込んでいません。

* Python 言語リファレンス: 字句解析
* The Rust Reference: Statements and expressions
* The Go Programming Language Specification
* ECMAScript Language Specification
