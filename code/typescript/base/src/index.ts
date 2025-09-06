enum Color {
  heart = '♥',
  spade = '♠',
  club = '♣',
  diamond = '♦',
}
enum Mark {
  A = 'A',
  two = '2',
  three = '3',
  four = '4',
  five = '5',
  six = '6',
  seven = '7',
  eight = '8',
  nine = '9',
  ten = '10',
  jack = 'J',
  queen = 'Q',
  king = 'K',
}

export class Deck {
  private cards: Card[] = [];

  constructor(cards?: Card[]) {
    if (cards) {
      this.cards = cards;
    } else {
      this._init();
    }
  }

  private _init() {
    const marks = Object.values(Mark);
    const colors = Object.values(Color);

    for (const m of marks) {
      for (const c of colors) {
        this.cards.push({
          color: c,
          mark: m,
          getString() {
            return `${this.color}_${this.mark}`;
          },
        } as NormalCard);
      }
    }
    let joker: Joker = {
      type: 'small',
      getString() {
        return 'small joker';
      },
    };
    this.cards.push(joker);
    joker = {
      type: 'big',
      getString() {
        return 'big joker';
      },
    };
    this.cards.push(joker);
  }

  print() {
    let result = '\n';
    this.cards.forEach((card, i) => {
      result += card.getString() + '\t';
      if ((i + 1) % 6 === 0) {
        result += '\n';
      }
    });
    console.log(result);
  }

  publish(): [Deck, Deck, Deck, Deck] {
    let player1: Deck, player2: Deck, player3: Deck, left: Deck;
    player1 = this.takeCards(17);
    player2 = this.takeCards(17);
    player3 = this.takeCards(17);
    left = new Deck(this.cards);
    return [player1, player2, player3, left];
  }

  private takeCards(n: number): Deck {
    const cards: Card[] = [];
    for (let i = 0; i < n; i++) {
      cards.push(this.cards.shift() as Card);
    }
    return new Deck(cards);
  }

  shuffle() {
    for (let i = 0; i < this.cards.length; i++) {
      const index = this.getRandom(0, this.cards.length);
      [this.cards[i], this.cards[index]] = [this.cards[index], this.cards[i]];
    }
  }

  private getRandom(min: number, max: number) {
    const dec = max - min;
    return Math.floor(Math.random() * dec + min);
  }
}

interface Card {
  getString(): string;
}


interface NormalCard extends Card {
  color: Color;
  mark: Mark;
}

interface Joker extends Card {
  type: 'big' | 'small';
}

const deck = new Deck();
deck.shuffle();
deck.print();
const data = deck.publish();
for (let i = 0; i < data.length; i++) {
  data[i].print();
}