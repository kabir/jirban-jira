
export class IndexedColourUtil {
    static forIndex(index: number): string {
        let mod: number = index % 5;
        switch (mod) {
            case 0:
                return "red";
            case 1:
                return "orange";
            case 2:
                return "green";
            case 3:
                return "blue";
            case 4:
                return "violet";
        }
    }
}