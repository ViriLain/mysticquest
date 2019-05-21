from mysticquest import Room, House, Hero

def help_menu():
    str = """
    Directions:
      N: Go North
      S: Go South
      W: Go West
      E: Go East
      Q: Quit the game
    """

def make_house(raw):
    house = House()
    for raw_room in raw:
        room = raw_room.split('***')
        house.add_room(Room(room[0].strip(),
                          room[1].strip(),
                          room[2].strip(),
                          eval(room[3].strip())))
    return house

def create_mansion(filename):
    f = open(filename, 'r')
    raw_data = f.read()
    f.close()

    raw_rooms = raw_data.split('+++')
    the_mansion = make_house(raw_rooms)
    return the_mansion

def game_loop(our_hero):
    print(our_hero)
    while True:
        direction = raw_input('> ')
        direction = direction[0].upper()   
        if direction == 'N':
            our_hero.go_north()
            print(our_hero)
        elif direction == 'S':
            our_hero.go_south()
            print(our_hero)
        elif direction == 'E':
            our_hero.go_east()
            print(our_hero)
        elif direction == 'W':
            our_hero.go_west()
            print(our_hero)
        elif direction == 'Q':
            print("Thanks for playing!")
            exit(0)
        else:     
            print('Choice not valid, Try again')

def main():
    the_mansion = create_mansion("StoryBoard.txt")
    our_hero = Hero("Hero", the_mansion, 0)
    game_loop(our_hero)

if __name__ == "__main__":
    main()
