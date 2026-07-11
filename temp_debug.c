int main() {
    int val = 10;
    int* tmp = &val;
    *tmp = 42;
    return val;
}
