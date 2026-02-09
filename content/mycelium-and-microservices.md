---
id: mycelium-and-microservices
title: Mycelium networks and microservices
slug: mycelium-and-microservices
kind: post
date: 2026-01-28
tags: [programming, mushrooms]
excerpt: >
  The wood wide web has been doing distributed systems longer than we have.
  Notes on resilience, message passing, and decay.
published: true
---

Under every forest floor lies a network of fungal threads — mycelium — connecting trees, sharing nutrients, passing chemical signals. Ecologists call it the "wood wide web." It's been running a distributed system for about 500 million years.

We've been doing microservices for maybe 15.

## Message passing

Mycelium networks facilitate resource sharing between trees. A Douglas fir in sunlight sends carbon to a shaded hemlock. The hemlock sends back phosphorus. The fungus takes a cut — a transaction fee, if you will.

This looks a lot like an event-driven architecture: producers, consumers, and a broker in between.

## Resilience through redundancy

When a node in a mycelium network dies, the network routes around it. There's no single point of failure because the topology is a mesh, not a tree (ironic, given it connects trees).

We build the same patterns into our systems: circuit breakers, retries, failover. The forest got there first.

## Graceful decay

Here's the part we're bad at: mycelium networks handle decay gracefully. Dead trees become nurse logs. Decomposition is a feature, not a bug.

In software, we fear deprecation. We keep zombie services running because nobody wants to be the one to pull the plug. Maybe we should take notes from the fungi.

There's a similar pattern-recognition theme in [[chanterelles-and-clean-code]] — knowing when to stop is half the skill.
