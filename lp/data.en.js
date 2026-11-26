/* 英語のページ（en/）用。日本語の data.js のうち、言葉が入る所だけを差し替える。 */
window.POPCORN_LP = Object.assign(window.POPCORN_LP || {}, {
  "rules": [
    {
      "code": "\"popcorn\" >> Uppercase >> Display.",
      "output": "POPCORN"
    },
    {
      "code": "42 >> answer.\n\"The answer is {answer}.\" >> Display.",
      "output": "The answer is 42."
    },
    {
      "code": "[1, 2, 3] >> Map as x:\n    x * 2\n>> doubled.\n\ndoubled >> Display.",
      "output": "[2, 4, 6]"
    }
  ],
  "fallback": {
    "code": "text >> Trim >> Num >!> 0 >> age.",
    "samples": [
      {
        "input": "17",
        "output": "17"
      },
      {
        "input": " 3.5 ",
        "output": "3.5"
      },
      {
        "input": "abc",
        "output": "0",
        "error": "TypeError: Cannot cast 'abc' (Str) to Num"
      },
      {
        "input": "",
        "output": "0",
        "error": "TypeError: Cannot cast '' (Str) to Num"
      }
    ]
  },
  "errors": {
    "base": "[72, 85, 90] >> scores.\nscores >> Average >> Round(1) >> avg.\n\"The average is {avg}.\" >> Display.",
    "output": "The average is 82.3.",
    "cases": [
      {
        "id": "dot",
        "label": "Forget the “.”",
        "code": "[72, 85, 90] >> scores\nscores >> Average >> Round(1) >> avg.\n\"The average is {avg}.\" >> Display.",
        "mark": [
          0,
          16,
          22
        ],
        "error": "SyntaxError: Missing '.' at the end of the statement at line 1, column 17",
        "insert": "."
      },
      {
        "id": "func",
        "label": "Misspell a function",
        "code": "[72, 85, 90] >> scores.\nscores >> Avarage >> Round(1) >> avg.\n\"The average is {avg}.\" >> Display.",
        "mark": [
          1,
          10,
          17
        ],
        "error": "NameError: Function 'Avarage' is not defined."
      },
      {
        "id": "var",
        "label": "Misspell a name",
        "code": "[72, 85, 90] >> scores.\nscore >> Average >> Round(1) >> avg.\n\"The average is {avg}.\" >> Display.",
        "mark": [
          1,
          0,
          5
        ],
        "error": "NameError: Variable 'score' is not defined."
      },
      {
        "id": "string",
        "label": "Leave a quote open",
        "code": "[72, 85, 90] >> scores.\nscores >> Average >> Round(1) >> avg.\n\"The average is {avg}. >> Display.",
        "mark": [
          2,
          0,
          1
        ],
        "error": "SyntaxError: Unclosed string literal at line 3, column 1"
      }
    ]
  },
  "lab": {
    "source": [
      3,
      8,
      1,
      6,
      5,
      2
    ],
    "stages": [
      {
        "id": "even",
        "group": "pick",
        "code": "Filter (@ % 2 == 0)",
        "label": "Evens only",
        "numError": "TypeError: Filter stream requires a list"
      },
      {
        "id": "big",
        "group": "pick",
        "code": "Filter (@ > 4)",
        "label": "Bigger than 4",
        "numError": "TypeError: Filter stream requires a list"
      },
      {
        "id": "double",
        "group": "change",
        "code": "Map (@ * 2)",
        "label": "Double",
        "numError": "TypeError: Map stream requires a list"
      },
      {
        "id": "inc",
        "group": "change",
        "code": "Map (@ + 1)",
        "label": "Add 1",
        "numError": "TypeError: Map stream requires a list"
      },
      {
        "id": "square",
        "group": "change",
        "code": "Map (@ * @)",
        "label": "Square",
        "numError": "TypeError: Map stream requires a list"
      },
      {
        "id": "sort",
        "group": "order",
        "code": "Sort",
        "label": "Smallest first",
        "numError": "TypeError: Sort stream requires a list"
      },
      {
        "id": "desc",
        "group": "order",
        "code": "SortDesc",
        "label": "Largest first",
        "numError": "TypeError: SortDesc stream requires a list"
      },
      {
        "id": "reverse",
        "group": "order",
        "code": "Reverse",
        "label": "Reverse",
        "numError": "TypeError: Reverse requires List or Str"
      },
      {
        "id": "unique",
        "group": "order",
        "code": "Unique",
        "label": "No repeats",
        "numError": "TypeError: Unique requires List"
      },
      {
        "id": "top3",
        "group": "order",
        "code": "Slice(0, 3)",
        "label": "First 3",
        "numError": "TypeError: Slice target must be List or Str"
      },
      {
        "id": "sum",
        "group": "fold",
        "code": "Sum",
        "label": "Sum",
        "numError": "TypeError: Sum requires a List of Num values"
      },
      {
        "id": "max",
        "group": "fold",
        "code": "Max",
        "label": "Largest",
        "numError": "TypeError: Max requires a List of Num or Str values",
        "emptyError": "RuntimeError: Max requires a non-empty List"
      },
      {
        "id": "min",
        "group": "fold",
        "code": "Min",
        "label": "Smallest",
        "numError": "TypeError: Min requires a List of Num or Str values",
        "emptyError": "RuntimeError: Min requires a non-empty List"
      },
      {
        "id": "length",
        "group": "fold",
        "code": "Length",
        "label": "How many?",
        "numError": "TypeError: Cannot get length of Num"
      },
      {
        "id": "average",
        "group": "fold",
        "code": "Average",
        "label": "Average",
        "numError": "TypeError: Average requires a List of Num values",
        "emptyError": "RuntimeError: Average requires a non-empty List"
      }
    ],
    "presets": [
      {
        "label": "Double the evens, then sum",
        "stages": [
          "even",
          "double",
          "sum"
        ]
      },
      {
        "label": "Top 3, largest first",
        "stages": [
          "desc",
          "top3"
        ]
      },
      {
        "label": "Drop repeats and count",
        "stages": [
          "unique",
          "length"
        ]
      },
      {
        "label": "Break it on purpose",
        "stages": [
          "sum",
          "double"
        ]
      }
    ]
  },
  "examples": [
    {
      "id": "hello-pipeline",
      "label": "First step",
      "emoji": "👋",
      "interactive": false,
      "code": "42 >> answer.\n\"The answer is {answer}.\" >> Display."
    },
    {
      "id": "fizzbuzz",
      "label": "FizzBuzz",
      "emoji": "🔢",
      "interactive": false,
      "code": "(1, 30) >> Range >> Map as number:\n    number >> Check as value:\n        when value % 15 == 0:\n            \"FizzBuzz\".\n        when value % 3 == 0:\n            \"Fizz\".\n        when value % 5 == 0:\n            \"Buzz\".\n        else:\n            value >> Str.\n>> fizzbuzz.\n\nfizzbuzz >> Display."
    },
    {
      "id": "fortune",
      "label": "Fortune",
      "emoji": "🔮",
      "interactive": true,
      "code": "\"What's your name? \" >> Input >> name.\n[\"great luck\", \"good luck\", \"some luck\", \"luck\", \"luck later\"] >> fortunes.\n(0, 4) >> Random >> fortune_index.\nfortunes >> Get(fortune_index) >> fortune.\n\n\"{name}, today brings {fortune}!\" >> Display."
    },
    {
      "id": "rock-paper-scissors",
      "label": "Rock paper scissors",
      "emoji": "✊",
      "interactive": true,
      "code": "[\"rock\", \"paper\", \"scissors\"] >> hands.\n\"rock, paper, or scissors? \" >> Input >> choice.\n(0, 2) >> Random >> robot_index.\nhands >> Get(robot_index) >> robot.\n\nchoice >> Check:\n    when @ == robot:\n        \"A tie! You and Robot both chose {choice}.\".\n    else:\n        \"You chose {choice}. Robot chose {robot}!\".\n>> result.\n\nresult >> Display."
    },
    {
      "id": "lucky-snack",
      "label": "Snack roulette",
      "emoji": "🍿",
      "interactive": false,
      "code": "[\"popcorn\", \"pudding\", \"cookies\", \"donuts\"] >> snacks.\n(0, 3) >> Random >> index.\nsnacks >> Get(index) >> snack.\n\n\"Today's snack is {snack}.\" >> Display."
    },
    {
      "id": "countdown",
      "label": "Countdown",
      "emoji": "🚀",
      "interactive": false,
      "code": "5 >> Loop as count:\n    count >> Display.\n    \"Liftoff!\" >> Break when count == 0.\n    count - 1.\n>> result.\n\nresult >> Display."
    },
    {
      "id": "shopping-total",
      "label": "Shopping total",
      "emoji": "🛒",
      "interactive": false,
      "code": "[120, 250, 80, 300] >> Reduce(0) as (acc, price):\n    acc + price.\n>> total.\n\n\"Your total is {total} yen.\" >> Display."
    },
    {
      "id": "write-tests",
      "label": "Write tests",
      "emoji": "✅",
      "interactive": false,
      "code": "(price, rate) >> pop Discount:\n    price * (100 - rate) / 100 >> Round.\n\npop TestDiscount:\n    1000 >> Discount(20) >> Expect(800).\n    999 >> Discount(10) >> Expect(899).\n\npop TestNoDiscount:\n    500 >> Discount(0) >> Expect(500).\n\npop TestPriceIsNumber:\n    \"1000 yen\" >> ExpectError(@ >> Discount(10), \"TypeError\")."
    }
  ],
  "lessons": [
    {
      "badge": "01",
      "title": "Your first Display",
      "intro": "Print a short message and watch how PopCorn flows."
    },
    {
      "badge": "02",
      "title": "Double the numbers",
      "intro": "Map remakes each value in a list with the same rule."
    },
    {
      "badge": "03",
      "title": "Collect the evens",
      "intro": "Filter gathers only the values that match into a new list."
    },
    {
      "badge": "04",
      "title": "Find the total",
      "intro": "Reduce builds one answer from the result so far and the next value."
    },
    {
      "badge": "05",
      "title": "Update a profile",
      "intro": "Update makes a new dictionary without changing the original."
    },
    {
      "badge": "06",
      "title": "Sort numbers into groups",
      "intro": "Check tests conditions from the top and picks the first match."
    },
    {
      "badge": "07",
      "title": "Write an add function",
      "intro": "Use `pop` to make your own function that adds two numbers."
    },
    {
      "badge": "08",
      "title": "Count to 5 and stop",
      "intro": "Count up with Loop, then stop safely with Break and a trailing when."
    }
  ]
});
