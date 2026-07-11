use arcstr::ArcStr;
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use aether_parser::{PreProcessor, Parser};

fn parens(c: &mut Criterion) {
    // should take no more than n stack frames
    let n = 3000;
    let the_biggun = arcstr::format!("{}1 + 2{}", "(".repeat(n), ")".repeat(n));
    let parse = |s: &ArcStr| {
        let cpp = PreProcessor::new(
            s.as_str(),
            "<bench>",
            false,
            vec![],
            Default::default(),
        );
        let mut p = Parser::new(cpp, false);
        p.expr()
    };

    assert_eq!(parse(&the_biggun).unwrap().to_string(), "(1) + (2)");
    c.bench_function("rcc", |b| {
        b.iter(|| black_box(|| parse(&the_biggun)));
    });
}

criterion_group! {
    name = benches;
    config = Criterion::default();
    targets = parens
}
criterion_main!(benches);
