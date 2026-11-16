import { describe, expect, it } from 'vitest';
import { createWorld } from './world';

describe('createWorld', () => {
  it('a ball dropped from 5 m comes to rest on the floor', async () => {
    const { rapier, world } = await createWorld();

    const floor = world.createRigidBody(rapier.RigidBodyDesc.fixed());
    world.createCollider(rapier.ColliderDesc.cuboid(10, 0.5, 10).setTranslation(0, -0.5, 0), floor);
    const radius = 0.4;
    const ball = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(0, 5, 0));
    world.createCollider(rapier.ColliderDesc.ball(radius), ball);

    for (let i = 0; i < 300; i++) world.step();

    expect(Math.abs(ball.translation().y - radius)).toBeLessThan(0.01);
  });
});
