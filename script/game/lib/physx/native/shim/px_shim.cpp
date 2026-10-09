// PhysX 4.1.2 WebAssembly C ABI (mpj). Links against the unmodified NVIDIA PhysX 4.1 sources (BSD-3, see LICENSE.md next to this file).
// One export set serves JS (script/game/lib/physx/index.ts) and other wasm modules (import px.*): arguments/results are numbers only,
// objects are generation handles, memory is passed as offsets into this module's memory. ABI tables: docs/engine/11_moving_collision.md §9.4.
//
// io buffer = 256 x 32-bit slots (px_io_offset). geometry block (9 slots at g): [g+0] type u32 (0 sphere, 1 plane, 2 capsule, 3 box, 4 convex, 5 trimesh)
//   sphere r | capsule r, halfHeight (SDK X axis) | box hx, hy, hz | convex/trimesh scale x, y, z, scale rotation x, y, z, w (g+1..g+7), [g+8] mesh handle
// pose block (7 slots): px, py, pz, qx, qy, qz, qw
// hit buffer = 256 records x 16 slots (px_hits_offset): pos xyz, normal xyz, distance, u, v, flags u32, faceIndex u32, simulation filter word0..3 u32, shape handle
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <time.h>
#include "PxPhysicsAPI.h"
#include "geometry/PxGeometryQuery.h"
#include "GuMeshFactory.h"

#define PXW_API extern "C" __attribute__((used, visibility("default")))
#define PXW_ABI_VERSION 1

using namespace physx;

// deterministic clock: PhysX timers (profiling/statistics only) read 0; also removes the WASI clock import
extern "C" int clock_gettime(clockid_t, struct timespec* ts)
{
	ts->tv_sec = 0;
	ts->tv_nsec = 0;
	return 0;
}

namespace
{
	union Slot { PxU32 u; PxF32 f; };
	Slot gIo[256];
	PxU32 gHits[256 * 16];
	char gError[512];
	PxU32 gErrorCount = 0;

	enum Kind { K_NONE, K_TRI_MESH, K_CONVEX_MESH, K_SCENE, K_ACTOR, K_SHAPE, K_CCT_MANAGER, K_CCT, K_JOINT };
	struct Entry { void* p; PxU16 gen; PxU8 kind; PxU8 pad; PxU32 nextFree; };
	Entry* gTab = NULL;
	PxU32 gTabCap = 0, gTabUsed = 0, gFreeHead = 0;

	void setError(const char* msg)
	{
		gErrorCount++;
		snprintf(gError, sizeof(gError), "%s", msg);
	}

	PxU32 handleNew(void* p, Kind k)
	{
		if(!p)
			return 0;
		PxU32 i;
		if(gFreeHead)
		{
			i = gFreeHead - 1;
			gFreeHead = gTab[i].nextFree;
		}
		else
		{
			if(gTabUsed == gTabCap)
			{
				const PxU32 cap = gTabCap ? gTabCap * 2 : 1024;
				if(cap > 65535)
				{
					setError("handle table full");
					return 0;
				}
				Entry* t = static_cast<Entry*>(realloc(gTab, sizeof(Entry) * cap));
				if(!t)
					return 0;
				memset(t + gTabCap, 0, sizeof(Entry) * (cap - gTabCap));
				gTab = t;
				gTabCap = cap;
			}
			i = gTabUsed++;
			gTab[i].gen = 0;
		}
		gTab[i].gen = PxU16((gTab[i].gen + 1) & 0x7fff);
		if(gTab[i].gen == 0)
			gTab[i].gen = 1;
		gTab[i].p = p;
		gTab[i].kind = PxU8(k);
		gTab[i].nextFree = 0;
		return (PxU32(gTab[i].gen) << 16) | (i + 1);
	}

	void* handleGet(PxU32 h, Kind k)
	{
		const PxU32 i = (h & 0xffff) - 1;
		if(h == 0 || i >= gTabUsed || gTab[i].kind != k || gTab[i].gen != (h >> 16))
		{
			setError("invalid handle");
			return NULL;
		}
		return gTab[i].p;
	}

	void handleFree(PxU32 h)
	{
		const PxU32 i = (h & 0xffff) - 1;
		if(h == 0 || i >= gTabUsed || gTab[i].gen != (h >> 16) || gTab[i].kind == K_NONE)
			return;
		gTab[i].p = NULL;
		gTab[i].kind = K_NONE;
		gTab[i].nextFree = gFreeHead;
		gFreeHead = i + 1;
	}

	PxU32 userHandle(const void* userData) { return PxU32(uintptr_t(userData)); }

	struct Allocator : PxAllocatorCallback
	{
		void* allocate(size_t size, const char*, const char*, int) override { return aligned_alloc(16, (size + 15) & ~size_t(15)); }
		void deallocate(void* ptr) override { free(ptr); }
	};

	struct ErrorSink : PxErrorCallback
	{
		void reportError(PxErrorCode::Enum code, const char* message, const char* file, int line) override
		{
			if(code == PxErrorCode::eDEBUG_INFO)
				return;
			gErrorCount++;
			const char* f = file ? strrchr(file, '/') : NULL;
			if(!f && file)
				f = strrchr(file, '\\');
			snprintf(gError, sizeof(gError), "%d %s:%d %s", int(code), f ? f + 1 : (file ? file : "?"), line, message ? message : "");
		}
	};

	struct MemIn : PxInputStream
	{
		const PxU8* p;
		PxU32 n, at;
		MemIn(const void* data, PxU32 len) : p(static_cast<const PxU8*>(data)), n(len), at(0) {}
		PxU32 read(void* dest, PxU32 count) override
		{
			const PxU32 k = at + count <= n ? count : n - at;
			memcpy(dest, p + at, k);
			at += k;
			return k;
		}
	};

	Allocator gAllocator;
	ErrorSink gErrorSink;
	PxFoundation* gFoundation = NULL;
#if PXW_SCENE
	PxPhysics* gPhysics = NULL;

	struct InlineDispatcher : PxCpuDispatcher
	{
		void submitTask(PxBaseTask& task) override
		{
			task.run();
			task.release();
		}
		PxU32 getWorkerCount() const override { return 0; }
	};
	InlineDispatcher gDispatcher;

	PxFilterFlags simulationFilter(PxFilterObjectAttributes, PxFilterData, PxFilterObjectAttributes, PxFilterData, PxPairFlags& pairFlags, const void*, PxU32)
	{
		pairFlags = PxPairFlag::eCONTACT_DEFAULT;
		return PxFilterFlag::eDEFAULT;
	}

	// nn::bezel query prefilter FUN_710062c8b4 (reads PxShape vtable +0xB0 = getSimulationFilterData):
	// exclude entity (word2, word3) -> eNONE, else mask >> (word0 & 31) & 1 -> eBLOCK (single query) / eTOUCH (All query)
	struct LayerFilter : PxQueryFilterCallback
	{
		PxU32 mask, exA, exB;
		bool block;
		PxQueryHitType::Enum preFilter(const PxFilterData&, const PxShape* shape, const PxRigidActor*, PxHitFlags&) override
		{
			const PxFilterData d = shape->getSimulationFilterData();
			if((exA != 0 || exB != 0) && d.word2 == exA && d.word3 == exB)
				return PxQueryHitType::eNONE;
			if(((mask >> (d.word0 & 31)) & 1) == 0)
				return PxQueryHitType::eNONE;
			return block ? PxQueryHitType::eBLOCK : PxQueryHitType::eTOUCH;
		}
		PxQueryHitType::Enum postFilter(const PxFilterData&, const PxQueryHit&) override { return PxQueryHitType::eNONE; }
	};

	template<typename HitType>
	struct CollectAll : PxHitCallback<HitType>
	{
		HitType buf[128];
		PxU32 count, max;
		CollectAll(PxU32 maxOut) : PxHitCallback<HitType>(buf, 128), count(0), max(maxOut) {}
		PxAgain processTouches(const HitType* hits, PxU32 nb) override;
	};
#else
	GuMeshFactory* gMeshFactory = NULL;
#endif

	PxU32 u(PxU32 i) { return gIo[i].u; }
	PxF32 f(PxU32 i) { return gIo[i].f; }
	PxVec3 v3(PxU32 i) { return PxVec3(f(i), f(i + 1), f(i + 2)); }
	PxTransform pose(PxU32 i) { return PxTransform(PxVec3(f(i), f(i + 1), f(i + 2)), PxQuat(f(i + 3), f(i + 4), f(i + 5), f(i + 6))); }
	void putPose(PxU32 i, const PxTransform& t)
	{
		gIo[i].f = t.p.x; gIo[i + 1].f = t.p.y; gIo[i + 2].f = t.p.z;
		gIo[i + 3].f = t.q.x; gIo[i + 4].f = t.q.y; gIo[i + 5].f = t.q.z; gIo[i + 6].f = t.q.w;
	}

	bool geometry(PxU32 g, PxGeometryHolder& h)
	{
		switch(u(g))
		{
		case 0: h = PxSphereGeometry(f(g + 1)); return true;
		case 1: h = PxPlaneGeometry(); return true;
		case 2: h = PxCapsuleGeometry(f(g + 1), f(g + 2)); return true;
		case 3: h = PxBoxGeometry(f(g + 1), f(g + 2), f(g + 3)); return true;
		case 4:
		{
			PxConvexMesh* m = static_cast<PxConvexMesh*>(handleGet(u(g + 8), K_CONVEX_MESH));
			if(!m)
				return false;
			h = PxConvexMeshGeometry(m, PxMeshScale(v3(g + 1), PxQuat(f(g + 4), f(g + 5), f(g + 6), f(g + 7))));
			return true;
		}
		case 5:
		{
			PxTriangleMesh* m = static_cast<PxTriangleMesh*>(handleGet(u(g + 8), K_TRI_MESH));
			if(!m)
				return false;
			h = PxTriangleMeshGeometry(m, PxMeshScale(v3(g + 1), PxQuat(f(g + 4), f(g + 5), f(g + 6), f(g + 7))));
			return true;
		}
		default:
			setError("unknown geometry type");
			return false;
		}
	}

	void putHit(PxU32 k, const PxLocationHit& h, PxReal hu, PxReal hv, const PxShape* shape)
	{
		Slot* o = reinterpret_cast<Slot*>(gHits + k * 16);
		o[0].f = h.position.x; o[1].f = h.position.y; o[2].f = h.position.z;
		o[3].f = h.normal.x; o[4].f = h.normal.y; o[5].f = h.normal.z;
		o[6].f = h.distance; o[7].f = hu; o[8].f = hv;
		o[9].u = PxU32(h.flags); o[10].u = h.faceIndex;
		PxFilterData d;
		PxU32 sh = 0;
#if PXW_SCENE
		if(shape)
		{
			d = shape->getSimulationFilterData();
			sh = userHandle(shape->userData);
		}
#else
		PX_UNUSED(shape);
#endif
		o[11].u = d.word0; o[12].u = d.word1; o[13].u = d.word2; o[14].u = d.word3;
		o[15].u = sh;
	}

#if PXW_SCENE
	template<> PxAgain CollectAll<PxRaycastHit>::processTouches(const PxRaycastHit* hits, PxU32 nb)
	{
		for(PxU32 i = 0; i < nb && count < max; i++, count++)
			putHit(count, hits[i], hits[i].u, hits[i].v, hits[i].shape);
		return count < max;
	}
	template<> PxAgain CollectAll<PxSweepHit>::processTouches(const PxSweepHit* hits, PxU32 nb)
	{
		for(PxU32 i = 0; i < nb && count < max; i++, count++)
			putHit(count, hits[i], 0.0f, 0.0f, hits[i].shape);
		return count < max;
	}
	template<> PxAgain CollectAll<PxOverlapHit>::processTouches(const PxOverlapHit* hits, PxU32 nb)
	{
		for(PxU32 i = 0; i < nb && count < max; i++, count++)
		{
			PxLocationHit h;
			h.faceIndex = hits[i].faceIndex;
			h.flags = PxHitFlags(0);
			h.position = PxVec3(0.0f);
			h.normal = PxVec3(0.0f);
			h.distance = 0.0f;
			putHit(count, h, 0.0f, 0.0f, hits[i].shape);
		}
		return count < max;
	}

	LayerFilter filterFrom(PxU32 maskSlot, bool block)
	{
		LayerFilter lf;
		lf.mask = u(maskSlot);
		lf.exA = u(maskSlot + 1);
		lf.exB = u(maskSlot + 2);
		lf.block = block;
		return lf;
	}

	PxQueryFilterData bezelFilterData()
	{
		PxQueryFilterData fd;
		fd.data = PxFilterData(0, 0, 0, 0);
		fd.flags = PxQueryFlags(PxQueryFlag::eSTATIC | PxQueryFlag::eDYNAMIC | PxQueryFlag::ePREFILTER);
		return fd;
	}

	void releaseActor(PxRigidActor* a)
	{
		PxShape* shapes[64];
		const PxU32 n = a->getNbShapes();
		for(PxU32 i = 0; i < n; i += 64)
		{
			const PxU32 k = a->getShapes(shapes, 64, i);
			for(PxU32 j = 0; j < k; j++)
				handleFree(userHandle(shapes[j]->userData));
		}
		handleFree(userHandle(a->userData));
		a->release();
	}
#endif
}

PXW_API PxU32 px_abi_version() { return PXW_ABI_VERSION; }
PXW_API PxU32 px_physx_version() { return PX_PHYSICS_VERSION; }
PXW_API PxU32 px_io_offset() { return PxU32(uintptr_t(gIo)); }
PXW_API PxU32 px_io_size() { return sizeof(gIo); }
PXW_API PxU32 px_hits_offset() { return PxU32(uintptr_t(gHits)); }
PXW_API PxU32 px_hits_capacity() { return 256; }
PXW_API PxU32 px_hit_stride() { return 64; }
PXW_API PxU32 px_error_offset() { return PxU32(uintptr_t(gError)); }
PXW_API PxU32 px_error_size() { return sizeof(gError); }
PXW_API PxU32 px_error_count() { return gErrorCount; }
PXW_API PxU32 px_alloc(PxU32 size) { return PxU32(uintptr_t(aligned_alloc(16, (size + 15) & ~PxU32(15)))); }
PXW_API void px_free(PxU32 offset) { free(reinterpret_cast<void*>(uintptr_t(offset))); }

PXW_API PxU32 px_init()
{
	if(gFoundation)
		return 1;
	gFoundation = PxCreateFoundation(PX_PHYSICS_VERSION, gAllocator, gErrorSink);
	if(!gFoundation)
		return 0;
#if PXW_SCENE
	gPhysics = PxCreatePhysics(PX_PHYSICS_VERSION, *gFoundation, PxTolerancesScale(), false, NULL);
	if(!gPhysics)
		return 0;
#else
	gMeshFactory = PX_NEW(GuMeshFactory)();
#endif
	return 1;
}

// cooked stream (NXS MESH v15 / NXS CVXM v13) at offset..offset+len -> handle
PXW_API PxU32 px_tri_mesh_create(PxU32 offset, PxU32 len)
{
	MemIn s(reinterpret_cast<const void*>(uintptr_t(offset)), len);
#if PXW_SCENE
	return handleNew(gPhysics->createTriangleMesh(s), K_TRI_MESH);
#else
	return handleNew(gMeshFactory->createTriangleMesh(s), K_TRI_MESH);
#endif
}

PXW_API PxU32 px_convex_mesh_create(PxU32 offset, PxU32 len)
{
	MemIn s(reinterpret_cast<const void*>(uintptr_t(offset)), len);
#if PXW_SCENE
	return handleNew(gPhysics->createConvexMesh(s), K_CONVEX_MESH);
#else
	return handleNew(gMeshFactory->createConvexMesh(s), K_CONVEX_MESH);
#endif
}

PXW_API PxU32 px_mesh_release(PxU32 mesh)
{
	void* p = handleGet(mesh, K_TRI_MESH);
	if(p)
		static_cast<PxTriangleMesh*>(p)->release();
	else if((p = handleGet(mesh, K_CONVEX_MESH)) != NULL)
		static_cast<PxConvexMesh*>(p)->release();
	else
		return 0;
	handleFree(mesh);
	return 1;
}

// io out: [0] nbVertices [1] nbTriangles [2] PxTriangleMeshFlags [3..8] local bounds min/max
PXW_API PxU32 px_tri_mesh_info(PxU32 mesh)
{
	const PxTriangleMesh* m = static_cast<PxTriangleMesh*>(handleGet(mesh, K_TRI_MESH));
	if(!m)
		return 0;
	gIo[0].u = m->getNbVertices();
	gIo[1].u = m->getNbTriangles();
	gIo[2].u = PxU32(m->getTriangleMeshFlags());
	const PxBounds3 b = m->getLocalBounds();
	gIo[3].f = b.minimum.x; gIo[4].f = b.minimum.y; gIo[5].f = b.minimum.z;
	gIo[6].f = b.maximum.x; gIo[7].f = b.maximum.y; gIo[8].f = b.maximum.z;
	return 1;
}

// PxGeometryQuery (no scene). target geometry io[40..48], target pose io[49..55]
// raycast: origin io[0..2], unitDir io[3..5], maxDist io[6], hitFlags io[7] -> hits
PXW_API PxU32 px_geom_raycast(PxU32 maxHits)
{
	PxRaycastHit hits[16];
	PxGeometryHolder g;
	if(!geometry(40, g))
		return 0;
	const PxU32 n = PxGeometryQuery::raycast(v3(0), v3(3), g.any(), pose(49), f(6), PxHitFlags(PxU16(u(7))), maxHits < 16 ? maxHits : 16, hits);
	for(PxU32 i = 0; i < n; i++)
		putHit(i, hits[i], hits[i].u, hits[i].v, NULL);
	return n;
}

// sweep: query geometry io[0..8], query pose io[9..15], unitDir io[16..18], distance io[19], hitFlags io[20], inflation io[24] -> hit 0
PXW_API PxU32 px_geom_sweep()
{
	PxSweepHit hit;
	PxGeometryHolder g0, g1;
	if(!geometry(0, g0) || !geometry(40, g1))
		return 0;
	const bool r = PxGeometryQuery::sweep(v3(16), f(19), g0.any(), pose(9), g1.any(), pose(49), hit, PxHitFlags(PxU16(u(20))), f(24));
	if(r)
		putHit(0, hit, 0.0f, 0.0f, NULL);
	return r ? 1 : 0;
}

PXW_API PxU32 px_geom_overlap()
{
	PxGeometryHolder g0, g1;
	if(!geometry(0, g0) || !geometry(40, g1))
		return 0;
	return PxGeometryQuery::overlap(g0.any(), pose(9), g1.any(), pose(49)) ? 1 : 0;
}

// computePenetration(geometry io[0..8] at io[9..15], geometry io[40..48] at io[49..55]) -> io[32..34] direction, io[35] depth
PXW_API PxU32 px_geom_penetration()
{
	PxVec3 dir(0.0f);
	PxF32 depth = 0.0f;
	PxGeometryHolder g0, g1;
	if(!geometry(0, g0) || !geometry(40, g1))
		return 0;
	const bool r = PxGeometryQuery::computePenetration(dir, depth, g0.any(), pose(9), g1.any(), pose(49));
	gIo[32].f = dir.x; gIo[33].f = dir.y; gIo[34].f = dir.z; gIo[35].f = depth;
	return r ? 1 : 0;
}

#if PXW_SCENE
PXW_API PxU32 px_scene_create(PxF32 gx, PxF32 gy, PxF32 gz)
{
	PxSceneDesc d(gPhysics->getTolerancesScale());
	d.gravity = PxVec3(gx, gy, gz);
	d.cpuDispatcher = &gDispatcher;
	d.filterShader = simulationFilter;
	return handleNew(gPhysics->createScene(d), K_SCENE);
}

PXW_API PxU32 px_scene_release(PxU32 scene)
{
	PxScene* sc = static_cast<PxScene*>(handleGet(scene, K_SCENE));
	if(!sc)
		return 0;
	PxActor* list[64];
	while(sc->getNbActors(PxActorTypeFlag::eRIGID_STATIC | PxActorTypeFlag::eRIGID_DYNAMIC))
	{
		const PxU32 k = sc->getActors(PxActorTypeFlag::eRIGID_STATIC | PxActorTypeFlag::eRIGID_DYNAMIC, list, 64, 0);
		for(PxU32 i = 0; i < k; i++)
			releaseActor(static_cast<PxRigidActor*>(list[i]));
	}
	sc->release();
	handleFree(scene);
	return 1;
}

// motion 0 static, 1 kinematic, 2 dynamic; pose io[0..6]
PXW_API PxU32 px_actor_create(PxU32 motion)
{
	const PxTransform p = pose(0);
	PxRigidActor* a;
	if(motion == 0)
		a = gPhysics->createRigidStatic(p);
	else
	{
		PxRigidDynamic* d = gPhysics->createRigidDynamic(p);
		if(d && motion == 1)
			d->setRigidBodyFlag(PxRigidBodyFlag::eKINEMATIC, true);
		a = d;
	}
	const PxU32 h = handleNew(a, K_ACTOR);
	if(a)
		a->userData = reinterpret_cast<void*>(uintptr_t(h));
	return h;
}

PXW_API PxU32 px_actor_release(PxU32 actor)
{
	PxRigidActor* a = static_cast<PxRigidActor*>(handleGet(actor, K_ACTOR));
	if(!a)
		return 0;
	releaseActor(a);
	return 1;
}

PXW_API PxU32 px_scene_add(PxU32 scene, PxU32 actor)
{
	PxScene* sc = static_cast<PxScene*>(handleGet(scene, K_SCENE));
	PxRigidActor* a = static_cast<PxRigidActor*>(handleGet(actor, K_ACTOR));
	if(!sc || !a)
		return 0;
	sc->addActor(*a);
	return 1;
}

PXW_API PxU32 px_scene_remove(PxU32 scene, PxU32 actor)
{
	PxScene* sc = static_cast<PxScene*>(handleGet(scene, K_SCENE));
	PxRigidActor* a = static_cast<PxRigidActor*>(handleGet(actor, K_ACTOR));
	if(!sc || !a)
		return 0;
	sc->removeActor(*a);
	return 1;
}

// pose io[0..6]; mode 0 = setGlobalPose (teleport; dynamic linear/angular velocity reset), 1 = kinematic target
PXW_API PxU32 px_actor_set_pose(PxU32 actor, PxU32 mode)
{
	PxRigidActor* a = static_cast<PxRigidActor*>(handleGet(actor, K_ACTOR));
	if(!a)
		return 0;
	const PxTransform p = pose(0);
	PxRigidDynamic* d = a->is<PxRigidDynamic>();
	const bool kinematic = d && (d->getRigidBodyFlags() & PxRigidBodyFlag::eKINEMATIC);
	if(mode == 1 && kinematic && d->getScene())
	{
		d->setKinematicTarget(p);
		return 1;
	}
	a->setGlobalPose(p);
	if(d && !kinematic)
	{
		d->setLinearVelocity(PxVec3(0.0f));
		d->setAngularVelocity(PxVec3(0.0f));
	}
	return 1;
}

PXW_API PxU32 px_actor_get_pose(PxU32 actor)
{
	PxRigidActor* a = static_cast<PxRigidActor*>(handleGet(actor, K_ACTOR));
	if(!a)
		return 0;
	putPose(0, a->getGlobalPose());
	return 1;
}

// geometry io[0..8], local pose io[9..15], simulation filter words io[16..19], material io[20..22] (static, dynamic friction, restitution),
// flags io[23] = PxShapeFlags (1 simulation, 2 scene query, 4 trigger, 8 visualization) -> shape handle (exclusive shape attached to the actor)
PXW_API PxU32 px_shape_create(PxU32 actor)
{
	PxRigidActor* a = static_cast<PxRigidActor*>(handleGet(actor, K_ACTOR));
	PxGeometryHolder g;
	if(!a || !geometry(0, g))
		return 0;
	PxMaterial* m = gPhysics->createMaterial(f(20), f(21), f(22));
	PxShape* s = gPhysics->createShape(g.any(), *m, true, PxShapeFlags(PxU8(u(23))));
	m->release();
	if(!s)
		return 0;
	s->setLocalPose(pose(9));
	s->setSimulationFilterData(PxFilterData(u(16), u(17), u(18), u(19)));
	const PxU32 h = handleNew(s, K_SHAPE);
	s->userData = reinterpret_cast<void*>(uintptr_t(h));
	a->attachShape(*s);
	s->release();
	return h;
}

PXW_API PxU32 px_shape_set_flags(PxU32 shape, PxU32 flags)
{
	PxShape* s = static_cast<PxShape*>(handleGet(shape, K_SHAPE));
	if(!s)
		return 0;
	s->setFlags(PxShapeFlags(PxU8(flags)));
	return 1;
}

PXW_API PxU32 px_shape_set_filter(PxU32 shape)
{
	PxShape* s = static_cast<PxShape*>(handleGet(shape, K_SHAPE));
	if(!s)
		return 0;
	s->setSimulationFilterData(PxFilterData(u(16), u(17), u(18), u(19)));
	return 1;
}

PXW_API PxU32 px_shape_set_local_pose(PxU32 shape)
{
	PxShape* s = static_cast<PxShape*>(handleGet(shape, K_SHAPE));
	if(!s)
		return 0;
	s->setLocalPose(pose(9));
	return 1;
}

// io out [0..6] world pose, [7] actor handle
PXW_API PxU32 px_shape_get_world_pose(PxU32 shape)
{
	const PxShape* s = static_cast<PxShape*>(handleGet(shape, K_SHAPE));
	if(!s || !s->getActor())
		return 0;
	putPose(0, PxShapeExt::getGlobalPose(*s, *s->getActor()));
	gIo[7].u = userHandle(s->getActor()->userData);
	return 1;
}

// raycast: origin io[0..2], unitDir io[3..5], distance io[6], hitFlags io[7], mask io[8], exclude io[9..10].
// all = 0: block hit (nn::bezel CastRay), 1: touches in PhysX report order (CastRayAll, 128-hit touch buffer) up to maxOut
PXW_API PxU32 px_scene_raycast(PxU32 scene, PxU32 all, PxU32 maxOut)
{
	PxScene* sc = static_cast<PxScene*>(handleGet(scene, K_SCENE));
	if(!sc)
		return 0;
	LayerFilter lf = filterFrom(8, all == 0);
	const PxHitFlags hf(PxU16(u(7)));
	if(all == 0)
	{
		PxRaycastBuffer buf;
		sc->raycast(v3(0), v3(3), f(6), buf, hf, bezelFilterData(), &lf, NULL);
		if(!buf.hasBlock)
			return 0;
		putHit(0, buf.block, buf.block.u, buf.block.v, buf.block.shape);
		return 1;
	}
	CollectAll<PxRaycastHit> cb(maxOut < 256 ? maxOut : 256);
	sc->raycast(v3(0), v3(3), f(6), cb, hf, bezelFilterData(), &lf, NULL);
	return cb.count;
}

// sweep: geometry io[0..8], pose io[9..15], unitDir io[16..18], distance io[19], hitFlags io[20], mask io[21], exclude io[22..23], inflation io[24]
PXW_API PxU32 px_scene_sweep(PxU32 scene, PxU32 all, PxU32 maxOut)
{
	PxScene* sc = static_cast<PxScene*>(handleGet(scene, K_SCENE));
	PxGeometryHolder g;
	if(!sc || !geometry(0, g))
		return 0;
	LayerFilter lf = filterFrom(21, all == 0);
	const PxHitFlags hf(PxU16(u(20)));
	if(all == 0)
	{
		PxSweepBuffer buf;
		sc->sweep(g.any(), pose(9), v3(16), f(19), buf, hf, bezelFilterData(), &lf, NULL, f(24));
		if(!buf.hasBlock)
			return 0;
		putHit(0, buf.block, 0.0f, 0.0f, buf.block.shape);
		return 1;
	}
	CollectAll<PxSweepHit> cb(maxOut < 256 ? maxOut : 256);
	sc->sweep(g.any(), pose(9), v3(16), f(19), cb, hf, bezelFilterData(), &lf, NULL, f(24));
	return cb.count;
}

// overlap: geometry io[0..8], pose io[9..15], mask io[21], exclude io[22..23] -> touch records (faceIndex, filter words, shape handle)
PXW_API PxU32 px_scene_overlap(PxU32 scene, PxU32 maxOut)
{
	PxScene* sc = static_cast<PxScene*>(handleGet(scene, K_SCENE));
	PxGeometryHolder g;
	if(!sc || !geometry(0, g))
		return 0;
	LayerFilter lf = filterFrom(21, false);
	CollectAll<PxOverlapHit> cb(maxOut < 256 ? maxOut : 256);
	sc->overlap(g.any(), pose(9), cb, bezelFilterData(), &lf);
	return cb.count;
}

// computePenetration of geometry io[0..8] at io[9..15] against a scene shape (its geometry, current world pose) -> io[32..34] direction, io[35] depth
PXW_API PxU32 px_shape_penetration(PxU32 shape)
{
	const PxShape* s = static_cast<PxShape*>(handleGet(shape, K_SHAPE));
	PxGeometryHolder g;
	if(!s || !s->getActor() || !geometry(0, g))
		return 0;
	const PxGeometryHolder sg = s->getGeometry();
	PxVec3 dir(0.0f);
	PxF32 depth = 0.0f;
	const bool r = PxGeometryQuery::computePenetration(dir, depth, g.any(), pose(9), sg.any(), PxShapeExt::getGlobalPose(*s, *s->getActor()));
	gIo[32].f = dir.x; gIo[33].f = dir.y; gIo[34].f = dir.z; gIo[35].f = depth;
	return r ? 1 : 0;
}

// P2 (exposed only): one simulation step with the inline (0-thread) dispatcher
PXW_API PxU32 px_scene_simulate(PxU32 scene, PxF32 dt)
{
	PxScene* sc = static_cast<PxScene*>(handleGet(scene, K_SCENE));
	if(!sc)
		return 0;
	sc->simulate(dt);
	sc->fetchResults(true);
	return 1;
}

// io[0..2] linear, io[3..5] angular
PXW_API PxU32 px_actor_set_velocity(PxU32 actor)
{
	PxRigidActor* a = static_cast<PxRigidActor*>(handleGet(actor, K_ACTOR));
	PxRigidDynamic* d = a ? a->is<PxRigidDynamic>() : NULL;
	if(!d)
		return 0;
	d->setLinearVelocity(v3(0));
	d->setAngularVelocity(v3(3));
	return 1;
}

PXW_API PxU32 px_actor_get_velocity(PxU32 actor)
{
	PxRigidActor* a = static_cast<PxRigidActor*>(handleGet(actor, K_ACTOR));
	PxRigidDynamic* d = a ? a->is<PxRigidDynamic>() : NULL;
	if(!d)
		return 0;
	const PxVec3 l = d->getLinearVelocity();
	const PxVec3 w = d->getAngularVelocity();
	gIo[0].f = l.x; gIo[1].f = l.y; gIo[2].f = l.z; gIo[3].f = w.x; gIo[4].f = w.y; gIo[5].f = w.z;
	return 1;
}

PXW_API PxU32 px_actor_set_mass(PxU32 actor, PxF32 mass)
{
	PxRigidActor* a = static_cast<PxRigidActor*>(handleGet(actor, K_ACTOR));
	PxRigidDynamic* d = a ? a->is<PxRigidDynamic>() : NULL;
	if(!d)
		return 0;
	d->setMass(mass);
	return 1;
}
#endif

#if PXW_CCT
// P1 (exposed only): PxCapsuleController. desc io[0..2] position, [3] radius, [4] height, [5] stepOffset, [6] slopeLimit (cos), [7] contactOffset, [8..10] upDirection
PXW_API PxU32 px_cct_manager_create(PxU32 scene)
{
	PxScene* sc = static_cast<PxScene*>(handleGet(scene, K_SCENE));
	return sc ? handleNew(PxCreateControllerManager(*sc), K_CCT_MANAGER) : 0;
}

PXW_API PxU32 px_cct_manager_release(PxU32 mgr)
{
	PxControllerManager* m = static_cast<PxControllerManager*>(handleGet(mgr, K_CCT_MANAGER));
	if(!m)
		return 0;
	for(PxU32 i = 0; i < m->getNbControllers(); i++)
		handleFree(userHandle(m->getController(i)->getUserData()));
	m->release();
	handleFree(mgr);
	return 1;
}

PXW_API PxU32 px_cct_capsule_create(PxU32 mgr)
{
	PxControllerManager* m = static_cast<PxControllerManager*>(handleGet(mgr, K_CCT_MANAGER));
	if(!m)
		return 0;
	PxCapsuleControllerDesc d;
	d.position = PxExtendedVec3(f(0), f(1), f(2));
	d.radius = f(3);
	d.height = f(4);
	d.stepOffset = f(5);
	d.slopeLimit = f(6);
	d.contactOffset = f(7);
	d.upDirection = v3(8);
	d.material = gPhysics->createMaterial(0.5f, 0.5f, 0.0f);
	PxController* c = m->createController(d);
	d.material->release();
	const PxU32 h = handleNew(c, K_CCT);
	if(c)
		c->setUserData(reinterpret_cast<void*>(uintptr_t(h)));
	return h;
}

PXW_API PxU32 px_cct_release(PxU32 cct)
{
	PxController* c = static_cast<PxController*>(handleGet(cct, K_CCT));
	if(!c)
		return 0;
	c->release();
	handleFree(cct);
	return 1;
}

// move: io[0..2] displacement, io[3] minDist, io[4] elapsedTime -> PxControllerCollisionFlags
PXW_API PxU32 px_cct_move(PxU32 cct)
{
	PxController* c = static_cast<PxController*>(handleGet(cct, K_CCT));
	return c ? PxU32(c->move(v3(0), f(3), f(4), PxControllerFilters())) : 0;
}

PXW_API PxU32 px_cct_get_position(PxU32 cct)
{
	PxController* c = static_cast<PxController*>(handleGet(cct, K_CCT));
	if(!c)
		return 0;
	const PxExtendedVec3 p = c->getPosition();
	gIo[0].f = PxF32(p.x); gIo[1].f = PxF32(p.y); gIo[2].f = PxF32(p.z);
	return 1;
}
#endif

#if PXW_EXT
// P2 joints (exposed only): D6 joint between two actors (actor1 = 0: world). local frames io[0..6], io[7..13]
PXW_API PxU32 px_ext_d6_create(PxU32 actor0, PxU32 actor1)
{
	PxRigidActor* a0 = actor0 ? static_cast<PxRigidActor*>(handleGet(actor0, K_ACTOR)) : NULL;
	PxRigidActor* a1 = actor1 ? static_cast<PxRigidActor*>(handleGet(actor1, K_ACTOR)) : NULL;
	if((actor0 && !a0) || (actor1 && !a1))
		return 0;
	return handleNew(PxD6JointCreate(*gPhysics, a0, pose(0), a1, pose(7)), K_JOINT);
}

PXW_API PxU32 px_ext_joint_release(PxU32 joint)
{
	PxJoint* j = static_cast<PxJoint*>(handleGet(joint, K_JOINT));
	if(!j)
		return 0;
	j->release();
	handleFree(joint);
	return 1;
}
#endif
