<?php

it('allows guest to see home page', function () {
    $page = visit('http://localhost:8003/');

    $page->assertSee('Home')
        ->waitFor('#search', 10)
        ->assertSeeElement('.row.mb-3')
        ->assertSeeElement('#search img');
});

it('requires authentication for private object', function () {
    $page = visit('http://localhost:8003/object/d591f9d2-686a-4749-98c3-8fc6bb9d34da');

    $page->assertSee('Not Found');
});
