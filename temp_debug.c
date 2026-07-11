int main(void) {
    int i = 0;
    int sum = 0;
    while (i < 4) {
        for (int j = 0; j < 3; j += 1) {
            if ((i + j) % 2 == 0) {
                sum += i + j;
            } else {
                sum -= 1;
            }
        }
        i += 1;
    }
    return sum;
}
